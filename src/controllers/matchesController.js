import {
  createMatch,
  getMatchById,
  listMatchesByEvent,
  reopenMatch,
  recordMatchResult,
  updateMatchStatus,
} from "../service/match.js";
import { Event } from "../models/Event.js";
import { forbiddenError, notFoundError } from "../lib/errors.js";
import { parsePositiveInteger, requireFields } from "../lib/validation.js";

async function ensureEventManager(user, eventId) {
  const event = await Event.findById(eventId).select("createdByUserId").lean();

  if (!event) {
    throw notFoundError("Event nao encontrado");
  }

  if (user.role !== "admin" && String(event.createdByUserId) !== String(user.userId)) {
    throw forbiddenError("Apenas o organizador do evento ou admin pode alterar matches");
  }
}

export async function postMatch(req, res, next) {
  try {
    requireFields(req.body, ["eventId", "round", "participants"]);
    await ensureEventManager(req.user, req.body.eventId);
    const match = await createMatch(req.body);
    res.status(201).json(match);
  } catch (error) {
    next(error);
  }
}

export async function getMatch(req, res, next) {
  try {
    const match = await getMatchById(req.params.id);
    if (!match) {
      throw notFoundError("Match nao encontrada");
    }

    res.status(200).json(match);
  } catch (error) {
    next(error);
  }
}

export async function getMatchesByEvent(req, res, next) {
  try {
    requireFields(req.params, ["eventId"]);
    const matches = await listMatchesByEvent(req.params.eventId);
    res.status(200).json(matches);
  } catch (error) {
    next(error);
  }
}

export async function patchMatchResult(req, res, next) {
  try {
    requireFields(req.body, ["participants"]);
    const currentMatch = await getMatchById(req.params.id);
    if (!currentMatch) {
      throw notFoundError("Match nao encontrada");
    }

    await ensureEventManager(req.user, currentMatch.eventId);
    const updatedMatch = await recordMatchResult(req.params.id, req.body.participants ?? [], {
      actorUserId: req.user.userId,
      requestId: req.requestId,
    });
    res.status(200).json(updatedMatch);
  } catch (error) {
    next(error);
  }
}

export async function patchMatchStatus(req, res, next) {
  try {
    requireFields(req.body, ["status"]);
    const currentMatch = await getMatchById(req.params.id);
    if (!currentMatch) {
      throw notFoundError("Match nao encontrada");
    }

    await ensureEventManager(req.user, currentMatch.eventId);
    const match = await updateMatchStatus(req.params.id, req.body.status, {
      actorUserId: req.user.userId,
      requestId: req.requestId,
    });
    res.status(200).json(match);
  } catch (error) {
    next(error);
  }
}

export async function patchMatchReopen(req, res, next) {
  try {
    const currentMatch = await getMatchById(req.params.id);
    if (!currentMatch) {
      throw notFoundError("Match nao encontrada");
    }

    await ensureEventManager(req.user, currentMatch.eventId);
    const match = await reopenMatch(req.params.id, {
      actorUserId: req.user.userId,
      requestId: req.requestId,
    });
    res.status(200).json(match);
  } catch (error) {
    next(error);
  }
}
