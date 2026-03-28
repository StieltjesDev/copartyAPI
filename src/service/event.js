import { Event } from "../models/Event.js";
import { EventEntry } from "../models/EventEntry.js";
import { Match } from "../models/Match.js";
import { MatchParticipant } from "../models/MatchParticipant.js";
import { createMatch, listMatchesByEvent, recordMatchResult, updateMatchStatus } from "./match.js";
import {
  invalidStateError,
  notFoundError,
  validationError,
} from "../lib/errors.js";
import { writeAuditLog } from "./audit.js";
import { withOperationalLock } from "./operationLock.js";

function asId(value) {
  return String(value);
}

async function normalizeLegacyFinishedEvent(event) {
  if (!event || event.status !== "COMPLETED") {
    return event;
  }

  event.status = "FINISHED";
  await event.save();
  return event;
}

async function persistAutoCancelledEvent(event) {
  if (!event) {
    return event;
  }

  event = await normalizeLegacyFinishedEvent(event);

  if (event.status !== "SCHEDULED") {
    return event;
  }

  const eventDate = event.dateTime instanceof Date ? event.dateTime : new Date(event.dateTime);
  if (Number.isNaN(eventDate.getTime()) || eventDate >= new Date()) {
    return event;
  }

  event.status = "CANCELLED";
  await event.save();
  return event;
}

export async function syncEventLifecycle(eventId) {
  const event = await Event.findById(eventId);
  if (!event) {
    throw notFoundError("Event nao encontrado");
  }

  return persistAutoCancelledEvent(event);
}

export async function syncEventsLifecycle(events) {
  return Promise.all(events.map((event) => persistAutoCancelledEvent(event)));
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function floorTournamentPercentage(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.max(value, 1 / 3);
}

function calculateMatchWinRate(row) {
  if (!row.tiebreakMatchesPlayed) {
    return 0;
  }

  return floorTournamentPercentage(row.matchPointsForTiebreak / (row.tiebreakMatchesPlayed * 3));
}

function calculateGameWinRate(row) {
  if (!row.gamePointsAvailable) {
    return 0;
  }

  return floorTournamentPercentage(row.gamePointsForTiebreak / row.gamePointsAvailable);
}

function calculateAverageOpponentRate(opponents, selector) {
  if (!opponents.length) {
    return 0;
  }

  const total = opponents.reduce((sum, opponent) => sum + selector(opponent), 0);
  return total / opponents.length;
}

function isPositiveResult(resultType) {
  return ["WIN", "DRAW", "BYE"].includes(resultType);
}

function buildCommanderStreaks(completedMatches, participants) {
  const participantsByMatchId = new Map();

  for (const participant of participants) {
    const key = asId(participant.matchId);
    const list = participantsByMatchId.get(key) ?? [];
    list.push(participant);
    participantsByMatchId.set(key, list);
  }

  const streaks = new Map();
  const orderedMatches = [...completedMatches].sort((left, right) => (
    safeNumber(left.round) - safeNumber(right.round) ||
    safeNumber(left.tableNumber) - safeNumber(right.tableNumber) ||
    asId(left._id).localeCompare(asId(right._id), "pt-BR")
  ));

  for (const match of orderedMatches) {
    const matchParticipants = participantsByMatchId.get(asId(match._id)) ?? [];
    for (const participant of matchParticipants) {
      const entryId = asId(participant.eventEntryId);
      const previous = streaks.get(entryId) ?? 0;
      const next = isPositiveResult(participant.resultType) ? previous + 1 : 0;
      streaks.set(entryId, next);
    }
  }

  return streaks;
}

function sortStandingsForGameMode(rows, gameMode) {
  if (gameMode === "COMMANDER_MULTIPLAYER") {
    return rows.sort((left, right) => (
      right.points - left.points ||
      right.tb1Streak - left.tb1Streak ||
      right.tb2OpponentAveragePoints - left.tb2OpponentAveragePoints ||
      right.tb3OpponentAverageStreak - left.tb3OpponentAverageStreak ||
      right.opponentMatchWinRate - left.opponentMatchWinRate ||
      right.opponentGameWinRate - left.opponentGameWinRate ||
      right.wins - left.wins ||
      right.draws - left.draws ||
      left.losses - right.losses ||
      asId(left.playerId).localeCompare(asId(right.playerId), "pt-BR")
    ));
  }

  return rows.sort((left, right) => (
    right.points - left.points ||
    right.opponentMatchWinRate - left.opponentMatchWinRate ||
    right.gameWinRate - left.gameWinRate ||
    right.opponentGameWinRate - left.opponentGameWinRate ||
    right.buchholz - left.buchholz ||
    right.wins - left.wins ||
    right.draws - left.draws ||
    left.losses - right.losses ||
    asId(left.playerId).localeCompare(asId(right.playerId), "pt-BR")
  ));
}

function buildTieBreakSummary(row, gameMode) {
  if (gameMode === "COMMANDER_MULTIPLAYER") {
    return `Commander TB: Points=${safeNumber(row.points)}, TB1=${safeNumber(row.tb1Streak)}, TB2=${safeNumber(row.tb2OpponentAveragePoints).toFixed(2)}, TB3=${safeNumber(row.tb3OpponentAverageStreak).toFixed(2)}, OMW%=${(safeNumber(row.opponentMatchWinRate) * 100).toFixed(1)}%, OGW%=${(safeNumber(row.opponentGameWinRate) * 100).toFixed(1)}%`;
  }

  return `Wizards TB: Points=${safeNumber(row.points)}, OMW%=${(safeNumber(row.opponentMatchWinRate) * 100).toFixed(1)}%, GW%=${(safeNumber(row.gameWinRate) * 100).toFixed(1)}%, OGW%=${(safeNumber(row.opponentGameWinRate) * 100).toFixed(1)}%`;
}

export function calculateStandings(entries, matches, participants, options = {}) {
  const gameMode = options.gameMode ?? "ONE_VS_ONE";
  const standings = new Map();
  const completedMatches = matches.filter((match) => match.status === "COMPLETED");
  const completedMatchIds = new Set(completedMatches.map((match) => asId(match._id)));
  const participantsByMatchId = new Map();

  for (const entry of entries) {
    standings.set(asId(entry._id), {
      eventEntryId: entry._id,
      playerId: entry.playerId,
      deckId: entry.deckId,
      points: 0,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      byes: 0,
      matchPointsForTiebreak: 0,
      tiebreakMatchesPlayed: 0,
      gamePointsForTiebreak: 0,
      gamePointsAvailable: 0,
    });
  }

  for (const participant of participants) {
    if (!completedMatchIds.has(asId(participant.matchId))) {
      continue;
    }

    const matchParticipants = participantsByMatchId.get(asId(participant.matchId)) ?? [];
    matchParticipants.push(participant);
    participantsByMatchId.set(asId(participant.matchId), matchParticipants);

    const row = standings.get(asId(participant.eventEntryId));
    if (!row) {
      continue;
    }

    row.points += participant.pointsEarned ?? 0;
    row.matchesPlayed += 1;

    switch (participant.resultType) {
      case "WIN":
        row.wins += 1;
        break;
      case "DRAW":
        row.draws += 1;
        break;
      case "BYE":
        row.byes += 1;
        row.wins += 1;
        break;
      default:
        row.losses += 1;
        break;
    }
  }

  const opponentEntriesMap = buildOpponentEntriesMap(completedMatches, participants);
  const commanderStreaks = gameMode === "COMMANDER_MULTIPLAYER"
    ? buildCommanderStreaks(completedMatches, participants)
    : new Map();

  for (const match of completedMatches) {
    const matchParticipants = participantsByMatchId.get(asId(match._id)) ?? [];

    if (matchParticipants.length === 1 && matchParticipants[0]?.resultType === "BYE") {
      continue;
    }

    const totalScore = matchParticipants.reduce((sum, participant) => sum + safeNumber(participant.score), 0);
    const isCommanderStyleMatch = matchParticipants.length > 2;
    const gamePointsAvailable = isCommanderStyleMatch ? 1 : Math.max(totalScore, 1);

    for (const participant of matchParticipants) {
      const row = standings.get(asId(participant.eventEntryId));
      if (!row) {
        continue;
      }

      row.tiebreakMatchesPlayed += 1;
      row.matchPointsForTiebreak += safeNumber(participant.pointsEarned);

      if (isCommanderStyleMatch) {
        const gamePoints = participant.resultType === "WIN" ? 1 : participant.resultType === "DRAW" ? 0.5 : 0;
        row.gamePointsForTiebreak += gamePoints;
        row.gamePointsAvailable += 1;
      } else {
        row.gamePointsForTiebreak += safeNumber(participant.score);
        row.gamePointsAvailable += gamePointsAvailable;
      }
    }
  }

  const rows = [...standings.values()].map((row) => {
    const opponentRows = (opponentEntriesMap.get(asId(row.eventEntryId)) ?? [])
      .map((opponentEntryId) => standings.get(opponentEntryId))
      .filter(Boolean);

    const buchholz = opponentRows.reduce((sum, opponent) => sum + safeNumber(opponent.points), 0);
    const matchWinRate = calculateMatchWinRate(row);
    const gameWinRate = calculateGameWinRate(row);
    const opponentMatchWinRate = calculateAverageOpponentRate(opponentRows, calculateMatchWinRate);
    const opponentGameWinRate = calculateAverageOpponentRate(opponentRows, calculateGameWinRate);
    const tb1Streak = commanderStreaks.get(asId(row.eventEntryId)) ?? 0;
    const tb2OpponentAveragePoints = calculateAverageOpponentRate(opponentRows, (opponent) => safeNumber(opponent.points));
    const tb3OpponentAverageStreak = calculateAverageOpponentRate(opponentRows, (opponent) => safeNumber(commanderStreaks.get(asId(opponent.eventEntryId)) ?? 0));

    return {
      ...row,
      buchholz,
      matchWinRate,
      gameWinRate,
      opponentMatchWinRate,
      opponentGameWinRate,
      tb1Streak,
      tb2OpponentAveragePoints,
      tb3OpponentAverageStreak,
    };
  });

  return sortStandingsForGameMode(rows, gameMode)
    .map((row, index) => ({
      ...row,
      position: index + 1,
      tieBreakSummary: buildTieBreakSummary(row, gameMode),
    }));
}

function buildOpponentMap(matches, participants) {
  const byMatchId = new Map();
  for (const participant of participants) {
    const key = asId(participant.matchId);
    const list = byMatchId.get(key) ?? [];
    list.push(participant);
    byMatchId.set(key, list);
  }

  const opponentMap = new Map();

  for (const match of matches) {
    const list = byMatchId.get(asId(match._id)) ?? [];
    if (list.length < 2) {
      continue;
    }

    for (const participant of list) {
      const entryId = asId(participant.eventEntryId);
      const current = opponentMap.get(entryId) ?? new Set();
      for (const opponent of list) {
        if (asId(opponent.eventEntryId) !== entryId) {
          current.add(asId(opponent.eventEntryId));
        }
      }
      opponentMap.set(entryId, current);
    }
  }

  return opponentMap;
}

function buildOpponentEntriesMap(matches, participants) {
  const byMatchId = new Map();
  for (const participant of participants) {
    const key = asId(participant.matchId);
    const list = byMatchId.get(key) ?? [];
    list.push(participant);
    byMatchId.set(key, list);
  }

  const opponentEntriesMap = new Map();

  for (const match of matches) {
    const list = byMatchId.get(asId(match._id)) ?? [];
    if (list.length < 2) {
      continue;
    }

    for (const participant of list) {
      const entryId = asId(participant.eventEntryId);
      const current = opponentEntriesMap.get(entryId) ?? [];
      for (const opponent of list) {
        if (asId(opponent.eventEntryId) !== entryId) {
          current.push(asId(opponent.eventEntryId));
        }
      }
      opponentEntriesMap.set(entryId, current);
    }
  }

  return opponentEntriesMap;
}

export function generateSwissPairings(entries, previousMatches = [], previousParticipants = [], round = 1) {
  const orderedEntries = round === 1 ? shuffle(entries) : [...entries];
  const opponentMap = buildOpponentMap(previousMatches, previousParticipants);
  const working = [...orderedEntries];
  const pairs = [];

  while (working.length > 1) {
    const current = working.shift();
    let opponentIndex = working.findIndex((candidate) => {
      const previousOpponents = opponentMap.get(asId(current.eventEntryId ?? current._id)) ?? new Set();
      return !previousOpponents.has(asId(candidate.eventEntryId ?? candidate._id));
    });

    if (opponentIndex === -1) {
      opponentIndex = 0;
    }

    const [opponent] = working.splice(opponentIndex, 1);
    pairs.push([current, opponent]);
  }

  if (working.length === 1) {
    pairs.push([working[0]]);
  }

  return pairs;
}

function splitCommanderTables(entries) {
  const tableCount = Math.ceil(entries.length / 4);
  const baseSize = Math.floor(entries.length / tableCount);
  const remainder = entries.length % tableCount;
  const sizes = [];

  for (let index = 0; index < tableCount; index += 1) {
    sizes.push(baseSize + (index < remainder ? 1 : 0));
  }

  const tables = [];
  let cursor = 0;
  for (const size of sizes) {
    tables.push(entries.slice(cursor, cursor + size));
    cursor += size;
  }

  return tables;
}

function buildCommanderOpponentMap(matches, participants) {
  return buildOpponentMap(matches, participants);
}

export function generateCommanderTables(entries, previousMatches = [], previousParticipants = []) {
  const sizes = splitCommanderTables(entries).map((table) => table.length);
  const opponentMap = buildCommanderOpponentMap(previousMatches, previousParticipants);
  const remaining = [...entries];
  const tables = sizes.map(() => []);

  for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
    while (tables[tableIndex].length < sizes[tableIndex] && remaining.length) {
      let bestIndex = 0;
      let bestScore = Number.POSITIVE_INFINITY;

      for (let candidateIndex = 0; candidateIndex < remaining.length; candidateIndex += 1) {
        const candidate = remaining[candidateIndex];
        const candidateId = asId(candidate.eventEntryId ?? candidate._id);
        const previousOpponents = opponentMap.get(candidateId) ?? new Set();
        const rematchCount = tables[tableIndex].reduce((count, seated) => (
          count + (previousOpponents.has(asId(seated.eventEntryId ?? seated._id)) ? 1 : 0)
        ), 0);

        if (rematchCount < bestScore) {
          bestScore = rematchCount;
          bestIndex = candidateIndex;
        }
      }

      const [selected] = remaining.splice(bestIndex, 1);
      tables[tableIndex].push(selected);
    }
  }

  return tables;
}

export async function generateRound(eventId, round, auditContext = {}) {
  return withOperationalLock(`round:generate:${eventId}:${round}`, "Geracao de rodada", async () => {
    const event = await Event.findById(eventId);
    if (!event) {
      throw notFoundError("Event nao encontrado");
    }

    if (!["ONE_VS_ONE", "COMMANDER_MULTIPLAYER"].includes(event.gameMode)) {
      throw validationError("Geracao de rodadas automatica disponivel apenas para ONE_VS_ONE e COMMANDER_MULTIPLAYER");
    }

    if (event.status !== "ONGOING") {
      throw invalidStateError("Rodadas so podem ser geradas para eventos em andamento");
    }

    const currentRoundMatches = await Match.find({ eventId, round }).lean();
    if (currentRoundMatches.length > 0) {
      throw invalidStateError("A rodada informada ja foi gerada");
    }

    if (round > 1) {
      const previousRoundMatches = await Match.find({ eventId, round: round - 1 }).lean();
      const hasPending = previousRoundMatches.some((match) => match.status !== "COMPLETED");
      if (hasPending) {
        throw invalidStateError("Nao e permitido gerar rodada com a rodada anterior em aberto");
      }
    }

    const entries = await EventEntry.find({
      eventId,
      entryType: "PLAYER",
      status: { $in: ["REGISTERED", "CHECKED_IN"] },
    }).lean();

    if (!entries.length) {
      throw validationError("Nao ha inscritos suficientes para gerar rodada");
    }

    const previousMatches = await Match.find({ eventId }).lean();
    const previousParticipants = await MatchParticipant.find({
      matchId: { $in: previousMatches.map((match) => match._id) },
    }).lean();

    const standings = calculateStandings(entries, previousMatches, previousParticipants, { gameMode: event.gameMode });
    const orderedEntries = round === 1
      ? entries
      : standings
          .map((row) => entries.find((entry) => asId(entry._id) === asId(row.eventEntryId)))
          .filter(Boolean);

    const pairings = event.gameMode === "COMMANDER_MULTIPLAYER"
      ? generateCommanderTables(orderedEntries, previousMatches, previousParticipants)
      : generateSwissPairings(orderedEntries, previousMatches, previousParticipants, round);
    const createdMatches = [];

    for (let index = 0; index < pairings.length; index += 1) {
      const pair = pairings[index];
      const createdMatch = await createMatch({
        eventId,
        round,
        tableNumber: index + 1,
        participants: pair.map((entry, seatIndex) => ({
          eventEntryId: entry._id,
          seatOrder: seatIndex + 1,
        })),
      });

      if (pair.length === 1) {
        await recordMatchResult(createdMatch._id, [
          {
            eventEntryId: pair[0]._id,
            resultType: "BYE",
            placement: 1,
            score: 2,
            pointsEarned: 3,
            isWinner: true,
            eliminations: 0,
          },
        ], auditContext);
        createdMatches.push(await updateMatchStatus(createdMatch._id, "COMPLETED", auditContext));
        continue;
      }

      createdMatches.push(createdMatch);
    }

    await writeAuditLog({
      ...auditContext,
      action: "round.generated",
      entityType: "Event",
      entityId: eventId,
      before: {
        round,
        existingMatches: currentRoundMatches.map((match) => String(match._id)),
      },
      after: {
        round,
        createdMatchIds: createdMatches.map((match) => String(match._id)),
      },
      metadata: {
        round,
        gameMode: event.gameMode,
        matchesCreated: createdMatches.length,
      },
    });

    return createdMatches;
  });
}

export async function getRoundMatches(eventId, round) {
  return listMatchesByEvent(eventId, { round });
}

export async function closeRound(eventId, round, auditContext = {}) {
  return withOperationalLock(`round:close:${eventId}:${round}`, "Fechamento de rodada", async () => {
    const event = await syncEventLifecycle(eventId);
    if (event.status !== "ONGOING") {
      throw invalidStateError("Apenas eventos em andamento podem fechar rodadas");
    }

    const matches = await Match.find({ eventId, round }).lean();
    if (!matches.length) {
      throw notFoundError("Rodada nao encontrada");
    }

    const hasPending = matches.some((match) => match.status !== "COMPLETED");
    if (hasPending) {
      throw invalidStateError("Nao e permitido fechar rodada com match pendente");
    }

    const standings = await getEventStandings(eventId);
    await writeAuditLog({
      ...auditContext,
      action: "round.closed",
      entityType: "Event",
      entityId: eventId,
      before: {
        round,
        matchStatuses: matches.map((match) => ({
          matchId: String(match._id),
          status: match.status,
        })),
      },
      after: {
        round,
        topStandings: standings.slice(0, 8),
      },
      metadata: {
        round,
        matches: matches.length,
      },
    });

    return standings;
  });
}

export async function finishEvent(eventId, auditContext = {}) {
  return withOperationalLock(`event:finish:${eventId}`, "Finalizacao do evento", async () => {
    const event = await syncEventLifecycle(eventId);

    if (["FINISHED", "COMPLETED"].includes(event.status)) {
      throw invalidStateError("Evento ja finalizado");
    }

    if (event.status !== "ONGOING") {
      throw invalidStateError("Apenas eventos em andamento podem ser finalizados");
    }

    const matches = await Match.find({ eventId }).lean();

    const before = {
      status: event.status,
      updatedAt: event.updatedAt,
    };

    event.status = "FINISHED";
    await event.save();

    await writeAuditLog({
      ...auditContext,
      action: "event.finished",
      entityType: "Event",
      entityId: eventId,
      before,
      after: {
        status: event.status,
        updatedAt: event.updatedAt,
      },
      metadata: {
        matches: matches.length,
      },
    });

    return event.toObject ? event.toObject() : event;
  });
}

export async function startEvent(eventId, auditContext = {}) {
  return withOperationalLock(`event:start:${eventId}`, "Inicio do evento", async () => {
    const event = await syncEventLifecycle(eventId);

    if (event.status === "CANCELLED") {
      throw invalidStateError("Evento cancelado nao pode ser iniciado");
    }

    if (["FINISHED", "COMPLETED"].includes(event.status)) {
      throw invalidStateError("Evento finalizado nao pode ser iniciado");
    }

    if (event.status !== "SCHEDULED") {
      throw invalidStateError("Apenas eventos agendados podem ser iniciados");
    }

    const before = {
      status: event.status,
      updatedAt: event.updatedAt,
    };

    event.status = "ONGOING";
    await event.save();

    await writeAuditLog({
      ...auditContext,
      action: "event.started",
      entityType: "Event",
      entityId: eventId,
      before,
      after: {
        status: event.status,
        updatedAt: event.updatedAt,
      },
      metadata: {},
    });

    return event.toObject ? event.toObject() : event;
  });
}

export async function cancelEvent(eventId, auditContext = {}) {
  return withOperationalLock(`event:cancel:${eventId}`, "Cancelamento do evento", async () => {
    const event = await syncEventLifecycle(eventId);

    if (["FINISHED", "COMPLETED"].includes(event.status)) {
      throw invalidStateError("Evento finalizado nao pode ser cancelado");
    }

    if (event.status === "CANCELLED") {
      throw invalidStateError("Evento ja cancelado");
    }

    if (!["DRAFT", "SCHEDULED"].includes(event.status)) {
      throw invalidStateError("Apenas eventos em rascunho ou agendados podem ser cancelados");
    }

    const before = {
      status: event.status,
      updatedAt: event.updatedAt,
    };

    event.status = "CANCELLED";
    await event.save();

    await writeAuditLog({
      ...auditContext,
      action: "event.cancelled",
      entityType: "Event",
      entityId: eventId,
      before,
      after: {
        status: event.status,
        updatedAt: event.updatedAt,
      },
      metadata: {},
    });

    return event.toObject ? event.toObject() : event;
  });
}

export async function getEventStandings(eventId) {
  const entries = await EventEntry.find({ eventId, entryType: "PLAYER" })
    .populate("playerId", "displayName")
    .populate("deckId", "name format commander")
    .lean();
  const matches = await Match.find({ eventId }).lean();
  const participants = await MatchParticipant.find({
    matchId: { $in: matches.map((match) => match._id) },
  }).lean();

  const event = await Event.findById(eventId).lean();
  const standings = calculateStandings(entries, matches, participants, { gameMode: event?.gameMode ?? "ONE_VS_ONE" });

  return standings.map((row) => {
    const entry = entries.find((item) => asId(item._id) === asId(row.eventEntryId));
    return {
      ...row,
      player: entry?.playerId ?? null,
      deck: entry?.deckId ?? null,
    };
  });
}
