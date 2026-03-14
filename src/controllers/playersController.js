import { Player } from "../models/Player.js";
import { forbiddenError, notFoundError, validationError } from "../lib/errors.js";
import { requireFields } from "../lib/validation.js";

export async function getPlayers(req, res, next) {
  try {
    const players = await Player.find().populate("userId", "username email role");
    res.status(200).json(players);
  } catch (err) {
    next(err);
  }
}

export async function getMyPlayer(req, res, next) {
  try {
    const player = await Player.findOne({ userId: req.user.userId }).populate(
      "userId",
      "username email role"
    );

    if (!player) {
      throw notFoundError("Player nao encontrado");
    }

    res.status(200).json(player);
  } catch (err) {
    next(err);
  }
}

export async function getPlayerById(req, res, next) {
  try {
    const player = await Player.findById(req.params.id).populate("userId", "username email role");

    if (!player) {
      throw notFoundError("Player nao encontrado");
    }

    if (req.user.role !== "admin" && String(player.userId._id) !== String(req.user.userId)) {
      throw forbiddenError("Acao nao permitida!");
    }

    res.status(200).json(player);
  } catch (err) {
    next(err);
  }
}

export async function createPlayer(req, res, next) {
  try {
    requireFields(req.body, ["displayName"]);
    const targetUserId = req.params.userId ?? req.user.userId;

    if (req.user.role !== "admin" && String(targetUserId) !== String(req.user.userId)) {
      throw forbiddenError("Acao nao permitida!");
    }

    const existingPlayer = await Player.findOne({ userId: targetUserId }).select("_id").lean();
    if (existingPlayer) {
      throw validationError("Ja existe player para este usuario");
    }

    const player = new Player({ ...req.body, userId: targetUserId });
    await player.save();

    res.status(201).json(player);
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((error) => error.message);
      throw validationError("Falha de validacao", messages);
    }

    next(err);
  }
}

export async function updatePlayer(req, res, next) {
  try {
    const player = await Player.findById(req.params.id);

    if (!player) {
      throw notFoundError("Player nao encontrado");
    }

    if (req.user.role !== "admin" && String(player.userId) !== String(req.user.userId)) {
      throw forbiddenError("Acao nao permitida!");
    }

    delete req.body.userId;

    const updatedPlayer = await Player.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json(updatedPlayer);
  } catch (err) {
    next(err);
  }
}
