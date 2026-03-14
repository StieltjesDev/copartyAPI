import { Event } from "../models/Event.js";
import { EventEntry } from "../models/EventEntry.js";
import { Match } from "../models/Match.js";
import { MatchParticipant } from "../models/MatchParticipant.js";
import {
  invalidStateError,
  notFoundError,
  validationError,
} from "../lib/errors.js";
import { writeAuditLog } from "./audit.js";
import { MATCH_STATUSES } from "../models/constants.js";
import { withOperationalLock } from "./operationLock.js";

const FINAL_STATUSES = new Set(["COMPLETED", "CANCELLED"]);
const ALLOWED_STATUS_TRANSITIONS = {
  PENDING: new Set(["ONGOING", "COMPLETED", "CANCELLED"]),
  ONGOING: new Set(["COMPLETED", "CANCELLED"]),
  COMPLETED: new Set(),
  CANCELLED: new Set(),
};

function asId(value) {
  return String(value);
}

export function ensureUniqueEventEntries(participants) {
  const ids = participants.map((participant) => asId(participant.eventEntryId));
  return new Set(ids).size === ids.length;
}

export function getDefaultPointsForResult(resultType) {
  switch (resultType) {
    case "WIN":
    case "BYE":
      return 3;
    case "DRAW":
      return 1;
    case "LOSS":
    case "ELIMINATED":
    default:
      return 0;
  }
}

function getCommanderPointsForPlacement(placement) {
  switch (placement) {
    case 1:
      return 5;
    case 2:
      return 3;
    case 3:
      return 2;
    case 4:
      return 1;
    default:
      return 0;
  }
}

export function validateMatchCreationInput(entries, eventId, participants) {
  if (!participants?.length) {
    throw validationError("participants e obrigatorio");
  }

  if (!ensureUniqueEventEntries(participants)) {
    throw validationError("Nao e permitido duplicar eventEntryId na mesma match");
  }

  if (entries.length !== participants.length) {
    throw validationError("Todos os participantes precisam ser event entries validos");
  }

  for (const entry of entries) {
    if (asId(entry.eventId) !== asId(eventId)) {
      throw validationError("Todos os eventEntryId precisam pertencer ao mesmo evento da match");
    }
  }

  return true;
}

export function validateResultConsistency(participants, gameMode = "ONE_VS_ONE") {
  if (!participants.length) {
    throw validationError("A match precisa ter participantes");
  }

  if (!ensureUniqueEventEntries(participants)) {
    throw validationError("Nao e permitido duplicar eventEntryId na mesma match");
  }

  for (const participant of participants) {
    if (!participant.resultType) {
      throw validationError("Toda match finalizada precisa ter resultType");
    }

    if (participant.placement != null && participant.placement < 1) {
      throw validationError("placement precisa ser maior que zero");
    }

    if (participant.score != null && participant.score < 0) {
      throw validationError("score nao pode ser negativo");
    }

    if (participant.pointsEarned != null && participant.pointsEarned < 0) {
      throw validationError("pointsEarned nao pode ser negativo");
    }

    if (participant.eliminations != null && participant.eliminations < 0) {
      throw validationError("eliminations nao pode ser negativo");
    }

    if (participant.resultType === "BYE") {
      if (participants.length !== 1) {
        throw validationError("BYE so e valido para match com um participante");
      }

      if (participant.isWinner !== true || participant.placement !== 1) {
        throw validationError("BYE exige isWinner true e placement 1");
      }
    }

    if (participant.resultType === "WIN") {
      if (participant.isWinner !== true || participant.placement !== 1) {
        throw validationError("WIN exige isWinner true e placement 1");
      }
    }

    if (participant.isWinner === true && participant.placement !== 1) {
      throw validationError("isWinner true exige placement 1");
    }
  }

  if (gameMode === "ONE_VS_ONE") {
    if (participants.length === 1) {
      if (participants[0].resultType !== "BYE") {
        throw validationError("Match 1v1 com um participante precisa ser BYE");
      }

      return true;
    }

    if (participants.length !== 2) {
      throw validationError("Match 1v1 precisa ter exatamente dois participantes");
    }

    const winners = participants.filter((participant) => participant.isWinner === true);
    const draws = participants.filter((participant) => participant.resultType === "DRAW");

    if (draws.length > 0) {
      if (draws.length !== 2 || winners.length !== 0) {
        throw validationError("Empate em 1v1 exige dois DRAW e nenhum vencedor");
      }

      return true;
    }

    if (winners.length !== 1) {
      throw validationError("Match 1v1 finalizada precisa ter um vencedor");
    }

    const loser = participants.find((participant) => participant.isWinner !== true);
    if (!loser || loser.resultType !== "LOSS" || loser.placement !== 2) {
      throw validationError("Match 1v1 precisa ter um perdedor com resultType LOSS e placement 2");
    }
  }

  if (gameMode === "COMMANDER_MULTIPLAYER") {
    if (participants.length < 2) {
      throw validationError("Mesa Commander precisa ter pelo menos dois participantes");
    }

    const placements = participants.map((participant) => participant.placement);
    if (placements.some((placement) => placement == null)) {
      throw validationError("Commander exige placement para todos os participantes");
    }

    if (new Set(placements).size !== placements.length) {
      throw validationError("Commander exige placements unicos");
    }

    const winners = participants.filter((participant) => participant.isWinner === true);
    if (winners.length !== 1 || winners[0].placement !== 1) {
      throw validationError("Commander exige exatamente um vencedor com placement 1");
    }
  }

  return true;
}

export async function createMatch(payload) {
  const { eventId, round, tableNumber, notes, participants } = payload;

  const event = await Event.findById(eventId);
  if (!event) {
    throw notFoundError("Event nao encontrado");
  }

  const eventEntryIds = participants.map((participant) => participant.eventEntryId);
  const entries = await EventEntry.find({ _id: { $in: eventEntryIds } });

  validateMatchCreationInput(entries, eventId, participants);

  const match = await Match.create({
    eventId,
    round,
    tableNumber,
    notes,
    status: "PENDING",
  });

  await MatchParticipant.insertMany(
    participants.map((participant, index) => ({
      matchId: match._id,
      eventEntryId: participant.eventEntryId,
      seatOrder: participant.seatOrder ?? index + 1,
      resultType: null,
      placement: null,
      score: 0,
      pointsEarned: 0,
      isWinner: false,
      eliminations: 0,
    }))
  );

  return getMatchById(match._id);
}

export async function getMatchById(matchId) {
  const match = await Match.findById(matchId).lean();
  if (!match) {
    return null;
  }

  const participants = await MatchParticipant.find({ matchId })
    .populate({
      path: "eventEntryId",
      populate: [
        { path: "playerId", select: "displayName" },
        { path: "deckId", select: "name format commander" },
      ],
    })
    .lean();

  return { ...match, participants };
}

export async function listMatchesByEvent(eventId, filters = {}) {
  const query = { eventId, ...filters };
  const matches = await Match.find(query).sort({ round: 1, tableNumber: 1, createdAt: 1 }).lean();

  const matchIds = matches.map((match) => match._id);
  const participants = await MatchParticipant.find({ matchId: { $in: matchIds } })
    .populate({
      path: "eventEntryId",
      populate: [
        { path: "playerId", select: "displayName" },
        { path: "deckId", select: "name format commander" },
      ],
    })
    .lean();

  const byMatchId = new Map();
  for (const participant of participants) {
    const key = asId(participant.matchId);
    const list = byMatchId.get(key) ?? [];
    list.push(participant);
    byMatchId.set(key, list);
  }

  return matches.map((match) => ({
    ...match,
    participants: byMatchId.get(asId(match._id)) ?? [],
  }));
}

export async function recordMatchResult(matchId, participantsPayload, auditContext = {}) {
  return withOperationalLock(`match:result:${matchId}`, "Envio de resultado da match", async () => {
    const match = await Match.findById(matchId);
    if (!match) {
      throw notFoundError("Match nao encontrada");
    }

    if (FINAL_STATUSES.has(match.status)) {
      throw invalidStateError("Nao e permitido alterar resultado de match finalizada");
    }

    const event = await Event.findById(match.eventId).lean();
    const existingParticipants = await MatchParticipant.find({ matchId }).lean();

    if (existingParticipants.length !== participantsPayload.length) {
      throw validationError("E necessario informar resultado para todos os participantes da match");
    }

    if (existingParticipants.some((participant) => participant.resultType != null)) {
      throw invalidStateError("Resultado da match ja foi registrado; reabra a match para reenviar");
    }

    const payloadIds = participantsPayload.map((participant) => asId(participant.eventEntryId));
    const existingIds = existingParticipants.map((participant) => asId(participant.eventEntryId));

    payloadIds.sort();
    existingIds.sort();
    if (payloadIds.join(",") !== existingIds.join(",")) {
      throw validationError("Os participantes informados nao correspondem aos participantes da match");
    }

    validateResultConsistency(participantsPayload, event.gameMode);

    for (const participant of participantsPayload) {
      await MatchParticipant.findOneAndUpdate(
        { matchId, eventEntryId: participant.eventEntryId },
        {
          resultType: participant.resultType,
          placement: participant.placement ?? null,
          score: participant.score ?? 0,
          pointsEarned: participant.pointsEarned ?? (
            event.gameMode === "COMMANDER_MULTIPLAYER"
              ? getCommanderPointsForPlacement(participant.placement)
              : getDefaultPointsForResult(participant.resultType)
          ),
          isWinner: participant.isWinner ?? false,
          eliminations: participant.eliminations ?? 0,
        },
        { new: true, runValidators: true }
      );
    }

    const afterParticipants = await MatchParticipant.find({ matchId }).lean();
    await writeAuditLog({
      ...auditContext,
      action: "match.result_submitted",
      entityType: "Match",
      entityId: matchId,
      before: existingParticipants,
      after: afterParticipants,
      metadata: {
        participants: participantsPayload.length,
        gameMode: event.gameMode,
      },
    });

    return getMatchById(matchId);
  });
}

export async function updateMatchStatus(matchId, status, auditContext = {}) {
  return withOperationalLock(`match:status:${matchId}`, "Mudanca de status da match", async () => {
    const match = await Match.findById(matchId);
    if (!match) {
      throw notFoundError("Match nao encontrada");
    }

    if (!MATCH_STATUSES.includes(status)) {
      throw validationError("Status de match invalido");
    }

    if (match.status === status) {
      return getMatchById(matchId);
    }

    if (!ALLOWED_STATUS_TRANSITIONS[match.status]?.has(status)) {
      throw invalidStateError(`Transicao invalida de ${match.status} para ${status}`);
    }

    const before = {
      status: match.status,
      startedAt: match.startedAt,
      finishedAt: match.finishedAt,
    };

    if (status === "COMPLETED") {
      const participants = await MatchParticipant.find({ matchId }).lean();
      const event = await Event.findById(match.eventId).lean();
      validateResultConsistency(participants, event.gameMode);
      match.finishedAt = new Date();
    }

    if (status === "ONGOING" && !match.startedAt) {
      match.startedAt = new Date();
    }

    if (status === "CANCELLED") {
      match.finishedAt = match.finishedAt ?? new Date();
    }

    match.status = status;
    await match.save();

    if (status === "COMPLETED") {
      const { applyMatchCompletionEffects } = await import("./rating.js");
      await applyMatchCompletionEffects(matchId, auditContext);
    }

    await writeAuditLog({
      ...auditContext,
      action: "match.status_changed",
      entityType: "Match",
      entityId: matchId,
      before,
      after: {
        status: match.status,
        startedAt: match.startedAt,
        finishedAt: match.finishedAt,
      },
      metadata: { status },
    });

    return getMatchById(matchId);
  });
}

export async function reopenMatch(matchId, auditContext = {}) {
  return withOperationalLock(`match:reopen:${matchId}`, "Reabertura da match", async () => {
    const match = await Match.findById(matchId);
    if (!match) {
      throw notFoundError("Match nao encontrada");
    }

    if (match.status !== "COMPLETED") {
      throw invalidStateError("Apenas match concluida pode ser reaberta");
    }

    const previousParticipants = await MatchParticipant.find({ matchId }).lean();
    match.status = "ONGOING";
    match.finishedAt = null;
    await match.save();

    for (const participant of previousParticipants) {
      await MatchParticipant.findOneAndUpdate(
        { matchId, eventEntryId: participant.eventEntryId },
        {
          resultType: null,
          placement: null,
          score: 0,
          pointsEarned: 0,
          isWinner: false,
          eliminations: 0,
        },
        { new: true, runValidators: true }
      );
    }

    const { rebuildRatingsFromResults } = await import("./rating.js");
    await rebuildRatingsFromResults({}, auditContext);

    const afterParticipants = await MatchParticipant.find({ matchId }).lean();
    await writeAuditLog({
      ...auditContext,
      action: "match.reopened",
      entityType: "Match",
      entityId: matchId,
      before: {
        status: "COMPLETED",
        participants: previousParticipants,
      },
      after: {
        status: "ONGOING",
        participants: afterParticipants,
      },
      metadata: {},
    });

    return getMatchById(matchId);
  });
}
