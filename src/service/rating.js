import { Deck } from "../models/Deck.js";
import { Event } from "../models/Event.js";
import { EventEntry } from "../models/EventEntry.js";
import { Match } from "../models/Match.js";
import { MatchParticipant } from "../models/MatchParticipant.js";
import { Player } from "../models/Player.js";
import { Rating } from "../models/Rating.js";
import { RatingHistory } from "../models/RatingHistory.js";
import { writeAuditLog } from "./audit.js";
import { notFoundError } from "../lib/errors.js";
import { withOperationalLock } from "./operationLock.js";

function getRatingDelta(resultType) {
  switch (resultType) {
    case "WIN":
    case "BYE":
      return 10;
    case "DRAW":
      return 3;
    case "LOSS":
    case "ELIMINATED":
    default:
      return 0;
  }
}

function getCommanderDelta(placement) {
  switch (placement) {
    case 1:
      return 12;
    case 2:
      return 6;
    case 3:
      return 3;
    case 4:
      return 1;
    default:
      return 0;
  }
}

export function buildRatingUpdates({ event, participants, entries, decks }) {
  const entryMap = new Map(entries.map((entry) => [String(entry._id), entry]));
  const deckMap = new Map(decks.map((deck) => [String(deck._id), deck]));

  return participants.map((participant) => {
    const entry = entryMap.get(String(participant.eventEntryId));
    const deck = entry?.deckId ? deckMap.get(String(entry.deckId)) : null;
    const delta = getRatingDelta(participant.resultType);

    return {
      participant,
      entry,
      deck,
      delta: event.gameMode === "COMMANDER_MULTIPLAYER"
        ? getCommanderDelta(participant.placement)
        : delta,
      gameMode: event.gameMode,
      format: deck?.format ?? "CUSTOM",
    };
  });
}

export async function applyMatchCompletionEffects(matchId, auditContext = {}) {
  const alreadyRated = await RatingHistory.exists({ matchId });
  if (alreadyRated) {
    return { applied: false };
  }

  const match = await Match.findById(matchId).lean();
  if (!match || match.status !== "COMPLETED") {
    return { applied: false };
  }

  const event = await Event.findById(match.eventId).lean();
  const participants = await MatchParticipant.find({ matchId }).lean();
  const entries = await EventEntry.find({
    _id: { $in: participants.map((participant) => participant.eventEntryId) },
  }).lean();
  const decks = await Deck.find({
    _id: { $in: entries.map((entry) => entry.deckId).filter(Boolean) },
  }).lean();

  const updates = buildRatingUpdates({ event, participants, entries, decks });
  const histories = [];

  for (const update of updates) {
    if (!update.entry?.playerId) {
      continue;
    }

    const playerFilter = {
      ratingType: "PLAYER",
      playerId: update.entry.playerId,
      gameMode: update.gameMode,
      format: update.format,
    };

    let playerRating = await Rating.findOne(playerFilter);
    if (!playerRating) {
      playerRating = await Rating.create({
        ...playerFilter,
        deckId: null,
        rating: 1000,
        matchesPlayed: 0,
      });
    }

    const oldPlayerRating = playerRating.rating;
    playerRating.rating += update.delta;
    playerRating.matchesPlayed += 1;
    await playerRating.save();

    histories.push({
      ratingType: "PLAYER",
      playerId: update.entry.playerId,
      deckId: null,
      matchId,
      oldRating: oldPlayerRating,
      newRating: playerRating.rating,
      delta: update.delta,
    });

    if (update.entry.deckId) {
      const deckFilter = {
        ratingType: "DECK",
        deckId: update.entry.deckId,
        gameMode: update.gameMode,
        format: update.format,
      };

      let deckRating = await Rating.findOne(deckFilter);
      if (!deckRating) {
        deckRating = await Rating.create({
          ...deckFilter,
          playerId: null,
          rating: 1000,
          matchesPlayed: 0,
        });
      }

      const oldDeckRating = deckRating.rating;
      deckRating.rating += update.delta;
      deckRating.matchesPlayed += 1;
      await deckRating.save();

      histories.push({
        ratingType: "DECK",
        playerId: null,
        deckId: update.entry.deckId,
        matchId,
        oldRating: oldDeckRating,
        newRating: deckRating.rating,
        delta: update.delta,
      });
    }

    await Player.findByIdAndUpdate(update.entry.playerId, {
      $inc: {
        points: update.participant.pointsEarned ?? 0,
        wins: update.participant.resultType === "WIN" || update.participant.resultType === "BYE" ? 1 : 0,
        losses: update.participant.resultType === "LOSS" || update.participant.resultType === "ELIMINATED" ? 1 : 0,
        draws: update.participant.resultType === "DRAW" ? 1 : 0,
      },
    });
  }

  if (histories.length) {
    await RatingHistory.insertMany(histories);
  }

  await writeAuditLog({
    ...auditContext,
    action: "rating.update",
    entityType: "Match",
    entityId: matchId,
    before: null,
    after: {
      applied: true,
      historiesCreated: histories.length,
    },
    metadata: {
      historiesCreated: histories.length,
    },
  });

  return { applied: true, historiesCreated: histories.length };
}

async function resolveRebuildScope(scope = {}) {
  if (scope.matchId) {
    const match = await Match.findById(scope.matchId).lean();
    if (!match) {
      throw notFoundError("Match nao encontrada");
    }

    return {
      scope: { matchId: String(scope.matchId), eventId: String(match.eventId), round: match.round },
      entityType: "Match",
      entityId: scope.matchId,
    };
  }

  if (scope.eventId && scope.round != null) {
    const event = await Event.findById(scope.eventId).lean();
    if (!event) {
      throw notFoundError("Event nao encontrado");
    }

    return {
      scope: { eventId: String(scope.eventId), round: Number(scope.round) },
      entityType: "Round",
      entityId: `${scope.eventId}:${scope.round}`,
    };
  }

  if (scope.eventId) {
    const event = await Event.findById(scope.eventId).lean();
    if (!event) {
      throw notFoundError("Event nao encontrado");
    }

    return {
      scope: { eventId: String(scope.eventId) },
      entityType: "Event",
      entityId: scope.eventId,
    };
  }

  return {
    scope: {},
    entityType: "Rating",
    entityId: "global",
  };
}

export async function rebuildRatingsFromResults(scope = {}, auditContext = {}) {
  return withOperationalLock("ratings:rebuild", "Rebuild de ratings", async () => {
    const target = await resolveRebuildScope(scope);

    await Rating.deleteMany({});
    await RatingHistory.deleteMany({});
    await Player.updateMany({}, { points: 0, wins: 0, losses: 0, draws: 0 });

    const completedMatches = await Match.find({ status: "COMPLETED" })
      .sort({ finishedAt: 1, createdAt: 1 })
      .lean();

    for (const match of completedMatches) {
      await applyMatchCompletionEffects(match._id, auditContext);
    }

    const targetMatches = completedMatches.filter((match) => {
      if (target.scope.matchId) {
        return String(match._id) === String(target.scope.matchId);
      }

      if (target.scope.eventId && target.scope.round != null) {
        return String(match.eventId) === String(target.scope.eventId)
          && Number(match.round) === Number(target.scope.round);
      }

      if (target.scope.eventId) {
        return String(match.eventId) === String(target.scope.eventId);
      }

      return true;
    });

    await writeAuditLog({
      ...auditContext,
      action: "rating.rebuild",
      entityType: target.entityType,
      entityId: target.entityId,
      before: null,
      after: {
        rebuilt: true,
        matchesProcessed: completedMatches.length,
      },
      metadata: {
        scope: target.scope,
        matchesProcessed: completedMatches.length,
        targetMatches: targetMatches.length,
      },
    });

    return {
      rebuilt: true,
      matchesProcessed: completedMatches.length,
      targetScope: target.scope,
      targetMatches: targetMatches.length,
      standingsRebuilt: false,
    };
  });
}

export async function getPlayerLeaderboard(filters = {}) {
  return Rating.find({
    ratingType: "PLAYER",
    ...(filters.gameMode ? { gameMode: filters.gameMode } : {}),
    ...(filters.format ? { format: filters.format } : {}),
  })
    .populate("playerId", "displayName")
    .sort({ rating: -1, matchesPlayed: -1, updatedAt: 1 })
    .lean();
}

export async function getDeckLeaderboard(filters = {}) {
  return Rating.find({
    ratingType: "DECK",
    ...(filters.gameMode ? { gameMode: filters.gameMode } : {}),
    ...(filters.format ? { format: filters.format } : {}),
  })
    .populate("deckId", "name format commander")
    .sort({ rating: -1, matchesPlayed: -1, updatedAt: 1 })
    .lean();
}
