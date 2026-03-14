import mongoose from "mongoose";
import { DECK_FORMATS } from "./constants.js";

const deckSchema = new mongoose.Schema(
  {
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: [true, "Player e obrigatorio"],
    },
    name: {
      type: String,
      required: [true, "Nome e obrigatorio"],
      trim: true,
      maxlength: [80, "Nome precisa ter no maximo 80 caracteres"],
    },
    commander: {
      type: String,
      trim: true,
      maxlength: [80, "Commander precisa ter no maximo 80 caracteres"],
    },
    format: {
      type: String,
      required: [true, "Format e obrigatorio"],
      enum: DECK_FORMATS,
    },
    link: {
      type: String,
      trim: true,
      maxlength: [500, "Link precisa ter no maximo 500 caracteres"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

deckSchema.index({ playerId: 1, isActive: 1 });

export const Deck = mongoose.model("Deck", deckSchema);
