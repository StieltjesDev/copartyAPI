import { Deck } from "../models/Deck.js";
import { Event } from "../models/Event.js";
import { EventEntry } from "../models/EventEntry.js";
import { Player } from "../models/Player.js";
import {
  cancelEvent,
  closeRound,
  finishEvent,
  generateRound,
  getEventStandings,
  getRoundMatches,
  startEvent,
  syncEventLifecycle,
  syncEventsLifecycle,
} from "../service/event.js";
import { listMatchesByEvent } from "../service/match.js";
import { forbiddenError, invalidStateError, notFoundError, validationError } from "../lib/errors.js";
import { parsePositiveInteger, requireFields } from "../lib/validation.js";

const COMMANDER_MULTIPLAYER_FORMATS = ["COMMANDER", "COMMANDER_500", "COMMANDER_250", "COMMANDER_15"];
const COMMANDER_FORMATS = [...COMMANDER_MULTIPLAYER_FORMATS, "COMMANDER_DUEL"];
const ALLOWED_PAIRINGS_BY_GAME_MODE = {
  ONE_VS_ONE: ["SWISS", "ROUND_ROBIN", "SINGLE_ELIMINATION", "DOUBLE_ELIMINATION", "POD"],
  COMMANDER_MULTIPLAYER: ["SWISS"],
  TWO_HEADED_GIANT: ["SWISS"],
  TWO_VS_TWO: ["SWISS"],
  MULTIPLAYER_FREE_FOR_ALL: ["SWISS"],
};

function resolveGameModeForFormat(format, requestedGameMode) {
  if (!format || format === "CUSTOM") {
    return requestedGameMode;
  }

  return COMMANDER_MULTIPLAYER_FORMATS.includes(format) ? "COMMANDER_MULTIPLAYER" : "ONE_VS_ONE";
}

function resolvePairingTypeForGameMode(gameMode, requestedPairingType) {
  const allowedPairings = ALLOWED_PAIRINGS_BY_GAME_MODE[gameMode] ?? ALLOWED_PAIRINGS_BY_GAME_MODE.ONE_VS_ONE;
  return allowedPairings.includes(requestedPairingType) ? requestedPairingType : allowedPairings[0];
}

function normalizeEventPayload(payload = {}) {
  const normalized = { ...payload };

  if (!normalized.format) {
    normalized.format = "CUSTOM";
  }

  normalized.gameMode = resolveGameModeForFormat(normalized.format, normalized.gameMode);
  normalized.pairingType = resolvePairingTypeForGameMode(normalized.gameMode, normalized.pairingType ?? "SWISS");
  return normalized;
}

async function ensureOrganizerOrAdmin(userId, role, eventId) {
  const event = await Event.findById(eventId).select("createdByUserId").lean();
  if (!event) {
    throw notFoundError("Event nao encontrado");
  }

  if (role !== "admin" && String(event.createdByUserId) !== String(userId)) {
    throw forbiddenError("Apenas o organizador do evento ou admin pode alterar rodadas");
  }
}

export async function getEvents(req, res, next) {
  try {
    const events = await Event.find();
    await syncEventsLifecycle(events);

    const result = await Promise.all(
      events.map(async (event) => {
        const qntPlayers = await EventEntry.countDocuments({ eventId: event._id });
        return { ...event.toObject(), qntPlayers };
      })
    );

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function findEventsByUserId(req, res, next) {
  try {
    const id = req.params.id ?? req.user.userId;

    if (req.user.role !== "admin" && req.user.userId !== id) {
      throw forbiddenError("Acao nao permitida!");
    }

    const events = await Event.find({ createdByUserId: id });
    await syncEventsLifecycle(events);
    res.status(200).json(events);
  } catch (err) {
    next(err);
  }
}

export async function createEvent(req, res, next) {
  try {
    requireFields(req.body, ["name", "dateTime", "pairingType", "gameMode"]);
    const dateTime = new Date(req.body.dateTime);
    if (Number.isNaN(dateTime.getTime())) {
      throw validationError("Data e hora invalidas");
    }

    const isDraft = Boolean(req.body.isDraft);
    if (!isDraft && dateTime < new Date()) {
      throw validationError("Evento agendado precisa ter data futura");
    }

    const payload = normalizeEventPayload(req.body);
    const event = new Event({
      ...payload,
      status: isDraft ? "DRAFT" : "SCHEDULED",
      dateTime,
      createdByUserId: req.user.userId,
    });

    await event.save();

    return res.status(201).json({
      id: event._id,
      message: "Event criado com sucesso!",
    });
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((error) => error.message);
      throw validationError("Falha de validacao", messages);
    }

    next(err);
  }
}

export async function putEvent(req, res, next) {
  try {
    const id = req.params.id;

    if (!id) {
      throw validationError("ID do Event e obrigatorio!");
    }

    delete req.body.createdByUserId;
    delete req.body.status;
    delete req.body.isDraft;

    const event = await syncEventLifecycle(id);

    if (req.user.role !== "admin" && String(event.createdByUserId) !== String(req.user.userId)) {
      throw forbiddenError("Acao nao permitida!");
    }

    if (["ONGOING", "COMPLETED", "FINISHED", "CANCELLED"].includes(event.status)) {
      throw forbiddenError("Evento ja terminou ou esta ocorrendo!");
    }

    if (req.body.dateTime) {
      const dateTime = new Date(req.body.dateTime);
      if (Number.isNaN(dateTime.getTime())) {
        throw validationError("Data e hora invalidas");
      }

      if (dateTime < new Date()) {
        throw validationError("Evento agendado precisa ter data futura");
      }
      req.body.dateTime = dateTime;
    }

    const currentEvent = event?.toObject ? event.toObject() : event;
    const payload = normalizeEventPayload({ ...currentEvent, ...req.body });
    const updatedEvent = await Event.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json(updatedEvent);
  } catch (err) {
    next(err);
  }
}

export async function deleteEvent(req, res, next) {
  try {
    const id = req.params.id;

    if (!id) {
      throw validationError("ID do Event e obrigatorio!");
    }

    const event = await Event.findById(id);
    if (!event) {
      throw notFoundError("Event nao encontrado");
    }

    if (req.user.role !== "admin" && String(event.createdByUserId) !== String(req.user.userId)) {
      throw forbiddenError("Acao nao permitida!");
    }

    await Event.findByIdAndDelete(id);
    return res.status(200).json({ message: "Event deletado com sucesso!" });
  } catch (err) {
    next(err);
  }
}

export async function getEventById(req, res, next) {
  try {
    const id = req.params.id;

    if (!id) {
      throw validationError("ID do Event e obrigatorio!");
    }

    const event = await syncEventLifecycle(id);

    return res.status(200).json(event);
  } catch (err) {
    next(err);
  }
}

export async function postEnterEvent(req, res, next) {
  try {
    const eventId = req.params.id;

    if (!eventId) {
      throw validationError("ID do Event e obrigatorio!");
    }

    const event = await syncEventLifecycle(eventId);
    if (!event) {
      throw notFoundError("Event nao encontrado");
    }

    if (!['DRAFT', 'SCHEDULED'].includes(event.status)) {
      throw validationError("Inscricoes so ficam abertas para eventos em rascunho ou agendados");
    }

    if (event.dateTime < new Date()) {
      throw validationError("Event ja ocorreu");
    }

    requireFields(req.body, ["deckId"]);

    const player = await Player.findOne({ userId: req.user.userId }).select("_id").lean();
    if (!player) {
      throw notFoundError("Player nao encontrado para o usuario autenticado");
    }

    const deck = await Deck.findById(req.body.deckId).select("playerId format commander isActive").lean();
    if (!deck) {
      throw notFoundError("Deck nao encontrado");
    }

    if (String(deck.playerId) !== String(player._id)) {
      throw forbiddenError("Deck nao pertence ao player autenticado");
    }

    if (!deck.isActive) {
      throw validationError("Somente decks ativos podem entrar em eventos");
    }

    if (event.format && event.format !== "CUSTOM" && deck.format !== event.format) {
      throw validationError("Deck incompativel com o formato do evento");
    }

    if (COMMANDER_FORMATS.includes(deck.format) && !deck.commander) {
      throw validationError("Deck de commander precisa ter comandante cadastrado");
    }

    const checkEntry = await EventEntry.findOne({
      eventId,
      entryType: "PLAYER",
      playerId: player._id,
    });

    if (checkEntry) {
      throw validationError("Player ja inscrito no evento");
    }

    const entry = new EventEntry({
      eventId,
      entryType: "PLAYER",
      playerId: player._id,
      teamId: null,
      deckId: req.body.deckId,
      seed: req.body.seed,
      status: req.body.status,
    });

    await entry.save();

    return res.status(201).json({
      id: entry._id,
      message: "Inscricao realizada com sucesso!",
    });
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((error) => error.message);
      throw validationError("Falha de validacao", messages);
    }

    next(err);
  }
}

export async function deleteLeaveEvent(req, res, next) {
  try {
    const eventId = req.params.id ?? req.params.idEvent;

    if (!eventId) {
      throw validationError("ID do Event e obrigatorio!");
    }

    const event = await syncEventLifecycle(eventId);
    if (!event) {
      throw notFoundError("Event nao encontrado");
    }

    if (!['DRAFT', 'SCHEDULED'].includes(event.status)) {
      throw validationError("So e possivel cancelar inscricao antes do evento iniciar");
    }

    if (event.dateTime < new Date()) {
      throw validationError("Event ja ocorreu");
    }

    const player = await Player.findOne({ userId: req.user.userId }).select("_id").lean();
    if (!player) {
      throw notFoundError("Player nao encontrado para o usuario autenticado");
    }

    const entry = await EventEntry.findOneAndDelete({
      eventId,
      entryType: "PLAYER",
      playerId: player._id,
    });

    if (!entry) {
      throw notFoundError("Usuario nao inscrito no Event");
    }

    return res.status(200).json({ message: "Inscricao cancelada com sucesso!" });
  } catch (err) {
    next(err);
  }
}

export async function removeEventEntry(req, res, next) {
  try {
    await ensureOrganizerOrAdmin(req.user.userId, req.user.role, req.params.eventId);

    const event = await syncEventLifecycle(req.params.eventId);
    if (!["DRAFT", "SCHEDULED"].includes(event.status)) {
      throw invalidStateError("Remocao de inscricao so e permitida antes do evento iniciar");
    }

    const filter = {
      _id: req.params.entryId,
      eventId: req.params.eventId,
      entryType: "PLAYER",
    };

    const entry = await EventEntry.findOneAndDelete(filter);
    if (!entry) {
      throw notFoundError("Inscricao nao encontrada");
    }

    return res.status(200).json({
      message: "Inscricao removida com sucesso!",
      entry,
    });
  } catch (err) {
    next(err);
  }
}

export async function dropEventEntry(req, res, next) {
  try {
    await ensureOrganizerOrAdmin(req.user.userId, req.user.role, req.params.eventId);

    const event = await syncEventLifecycle(req.params.eventId);
    if (event.status !== "ONGOING") {
      throw invalidStateError("Drop so pode ser aplicado depois que o evento iniciar");
    }

    const filter = {
      _id: req.params.entryId,
      eventId: req.params.eventId,
      entryType: "PLAYER",
    };

    const currentEntry = await EventEntry.findOne(filter).lean();
    if (!currentEntry) {
      throw notFoundError("Inscricao nao encontrada");
    }

    if (currentEntry.status === "DROPPED") {
      throw invalidStateError("Inscricao ja estava dropada");
    }

    const entry = await EventEntry.findOneAndUpdate(filter, { status: "DROPPED" }, { new: true });

    return res.status(200).json({
      message: "Inscricao marcada como drop com sucesso!",
      entry,
    });
  } catch (err) {
    next(err);
  }
}

export async function getPlayers(req, res, next) {
  try {
    const { eventId } = req.params;
    requireFields(req.params, ["eventId"]);

    const players = await EventEntry.find({ eventId, entryType: "PLAYER" })
      .populate("playerId", "displayName points wins losses draws")
      .populate("deckId", "name commander format link isActive");

    res.status(200).json(players);
  } catch (err) {
    next(err);
  }
}

export async function getEventEntries(req, res, next) {
  try {
    requireFields(req.params, ["eventId"]);
    const entries = await EventEntry.find({ eventId: req.params.eventId })
      .populate("playerId", "displayName")
      .populate("deckId", "name format commander link")
      .lean();
    res.status(200).json(entries);
  } catch (error) {
    next(error);
  }
}

export async function getMatchesForEvent(req, res, next) {
  try {
    requireFields(req.params, ["eventId"]);
    const matches = await listMatchesByEvent(req.params.eventId);
    res.status(200).json(matches);
  } catch (error) {
    next(error);
  }
}

export async function generateEventRound(req, res, next) {
  try {
    await ensureOrganizerOrAdmin(req.user.userId, req.user.role, req.params.eventId);
    const round = parsePositiveInteger(req.params.round, "round");
    const matches = await generateRound(req.params.eventId, round, {
      actorUserId: req.user.userId,
      requestId: req.requestId,
    });
    res.status(201).json(matches);
  } catch (error) {
    next(error);
  }
}

export async function getEventRound(req, res, next) {
  try {
    const round = parsePositiveInteger(req.params.round, "round");
    const matches = await getRoundMatches(req.params.eventId, round);
    res.status(200).json(matches);
  } catch (error) {
    next(error);
  }
}

export async function closeEventRound(req, res, next) {
  try {
    await ensureOrganizerOrAdmin(req.user.userId, req.user.role, req.params.eventId);
    const round = parsePositiveInteger(req.params.round, "round");
    const standings = await closeRound(req.params.eventId, round, {
      actorUserId: req.user.userId,
      requestId: req.requestId,
    });
    res.status(200).json(standings);
  } catch (error) {
    next(error);
  }
}

export async function finishCurrentEvent(req, res, next) {
  try {
    await ensureOrganizerOrAdmin(req.user.userId, req.user.role, req.params.id);
    const event = await finishEvent(req.params.id, {
      actorUserId: req.user.userId,
      requestId: req.requestId,
    });
    res.status(200).json({
      message: "Evento finalizado com sucesso!",
      event,
    });
  } catch (error) {
    next(error);
  }
}

export async function startCurrentEvent(req, res, next) {
  try {
    await ensureOrganizerOrAdmin(req.user.userId, req.user.role, req.params.id);
    const event = await startEvent(req.params.id, {
      actorUserId: req.user.userId,
      requestId: req.requestId,
    });
    res.status(200).json({
      message: "Evento iniciado com sucesso!",
      event,
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelCurrentEvent(req, res, next) {
  try {
    await ensureOrganizerOrAdmin(req.user.userId, req.user.role, req.params.id);
    const event = await cancelEvent(req.params.id, {
      actorUserId: req.user.userId,
      requestId: req.requestId,
    });
    res.status(200).json({
      message: "Evento cancelado com sucesso!",
      event,
    });
  } catch (error) {
    next(error);
  }
}

export async function getStandings(req, res, next) {
  try {
    requireFields(req.params, ["eventId"]);
    const standings = await getEventStandings(req.params.eventId);
    res.status(200).json(standings);
  } catch (error) {
    next(error);
  }
}



