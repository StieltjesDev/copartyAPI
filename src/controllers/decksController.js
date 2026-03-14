import { Deck } from "../models/Deck.js";
import { Player } from "../models/Player.js";
import { forbiddenError, notFoundError, validationError } from "../lib/errors.js";
import { requireFields } from "../lib/validation.js";

async function resolvePlayerIdForRequest(req) {
  if (req.params.playerId) {
    return req.params.playerId;
  }

  const player = await Player.findOne({ userId: req.user.userId }).select("_id").lean();
  return player?._id?.toString() ?? null;
}

async function resolveRequesterPlayerId(req) {
  const player = await Player.findOne({ userId: req.user.userId }).select("_id").lean();
  return player?._id?.toString() ?? null;
}

export async function getDecks(req, res, next) {
  try {
    const decks = await Deck.find().populate("playerId", "displayName userId");
    res.status(200).json(decks);
  } catch (err) {
    next(err);
  }
}

export async function getDeckById(req, res, next) {
  try {
    const deck = await Deck.findById(req.params.id).populate("playerId", "displayName userId");

    if (!deck) {
      throw notFoundError("Deck nao encontrado");
    }

    const requesterPlayerId = await resolveRequesterPlayerId(req);
    if (req.user.role !== "admin" && String(deck.playerId._id) !== String(requesterPlayerId)) {
      throw forbiddenError("Acao nao permitida!");
    }

    res.status(200).json(deck);
  } catch (err) {
    next(err);
  }
}

export async function findDecksByPlayerId(req, res, next) {
  try {
    const targetPlayerId = await resolvePlayerIdForRequest(req);

    if (!targetPlayerId) {
      throw notFoundError("Player nao encontrado");
    }

    const requesterPlayerId = await resolveRequesterPlayerId(req);
    if (req.user.role !== "admin" && String(targetPlayerId) !== String(requesterPlayerId)) {
      throw forbiddenError("Acao nao permitida!");
    }

    const decks = await Deck.find({ playerId: targetPlayerId });
    res.status(200).json(decks);
  } catch (err) {
    next(err);
  }
}

export async function createDeck(req, res, next) {
  try {
    requireFields(req.body, ["name", "format"]);
    const targetPlayerId = await resolvePlayerIdForRequest(req);

    if (!targetPlayerId) {
      throw notFoundError("Player nao encontrado");
    }

    const requesterPlayerId = await resolveRequesterPlayerId(req);
    if (req.user.role !== "admin" && String(targetPlayerId) !== String(requesterPlayerId)) {
      throw forbiddenError("Acao nao permitida!");
    }

    const deck = new Deck({ ...req.body, playerId: targetPlayerId });
    await deck.save();

    return res.status(201).json(deck);
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((error) => error.message);
      throw validationError("Falha de validacao", messages);
    }

    next(err);
  }
}

export async function putDeck(req, res, next) {
  try {
    const id = req.params.id;
    if (!id) {
      throw validationError("ID do deck e obrigatorio!");
    }

    delete req.body.playerId;

    const deck = await Deck.findById(id);
    if (!deck) {
      throw notFoundError("Deck nao encontrado");
    }

    const requesterPlayerId = await resolveRequesterPlayerId(req);
    if (req.user.role !== "admin" && String(deck.playerId) !== String(requesterPlayerId)) {
      throw forbiddenError("Acao nao permitida!");
    }

    const updatedDeck = await Deck.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json(updatedDeck);
  } catch (err) {
    next(err);
  }
}

export async function deleteDeck(req, res, next) {
  try {
    const id = req.params.id;
    if (!id) {
      throw validationError("ID do deck e obrigatorio!");
    }

    const deck = await Deck.findById(id);
    if (!deck) {
      throw notFoundError("Deck nao encontrado");
    }

    const requesterPlayerId = await resolveRequesterPlayerId(req);
    if (req.user.role !== "admin" && String(deck.playerId) !== String(requesterPlayerId)) {
      throw forbiddenError("Acao nao permitida!");
    }

    await Deck.findByIdAndDelete(id);
    return res.status(200).json({ message: "Deck deletado com sucesso!" });
  } catch (err) {
    next(err);
  }
}
