import mongoose from "mongoose";
import {
  DECK_FORMATS,
  EVENT_GAME_MODES,
  EVENT_PAIRING_TYPES,
  EVENT_STATUSES,
} from "./constants.js";

const eventSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Nome e obrigatorio"],
      trim: true,
      maxlength: [120, "Nome precisa ter no maximo 120 caracteres"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Descricao precisa ter no maximo 1000 caracteres"],
    },
    dateTime: {
      type: Date,
      required: [true, "Data e hora e obrigatoria"],
    },
    format: {
      type: String,
      enum: DECK_FORMATS,
      default: "CUSTOM",
    },
    pairingType: {
      type: String,
      required: [true, "Pairing type e obrigatorio"],
      enum: EVENT_PAIRING_TYPES,
    },
    status: {
      type: String,
      enum: EVENT_STATUSES,
      default: "DRAFT",
    },
    gameMode: {
      type: String,
      required: [true, "Game mode e obrigatorio"],
      enum: EVENT_GAME_MODES,
    },
    maxPlayers: {
      type: Number,
      min: [2, "Max players precisa ser ao menos 2"],
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by user e obrigatorio"],
    },
  },
  { timestamps: true }
);

export const Event = mongoose.model("Event", eventSchema);
