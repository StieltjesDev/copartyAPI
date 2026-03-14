import mongoose from "mongoose";
import { DECK_FORMATS, EVENT_GAME_MODES, RATING_TYPES } from "./constants.js";

const ratingSchema = new mongoose.Schema(
  {
    ratingType: {
      type: String,
      required: [true, "Rating type e obrigatorio"],
      enum: RATING_TYPES,
    },
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      default: null,
      validate: {
        validator(value) {
          if (this.ratingType === "PLAYER") {
            return Boolean(value) && this.deckId === null;
          }

          return value === null;
        },
        message: "Rating PLAYER exige playerId preenchido e deckId nulo",
      },
    },
    deckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deck",
      default: null,
      validate: {
        validator(value) {
          if (this.ratingType === "DECK") {
            return Boolean(value) && this.playerId === null;
          }

          return value === null;
        },
        message: "Rating DECK exige deckId preenchido e playerId nulo",
      },
    },
    gameMode: {
      type: String,
      required: [true, "Game mode e obrigatorio"],
      enum: EVENT_GAME_MODES,
    },
    format: {
      type: String,
      required: [true, "Format e obrigatorio"],
      enum: DECK_FORMATS,
    },
    rating: {
      type: Number,
      required: [true, "Rating e obrigatorio"],
      default: 1500,
    },
    rd: {
      type: Number,
      min: [0, "RD nao pode ser negativo"],
    },
    volatility: {
      type: Number,
      min: [0, "Volatility nao pode ser negativa"],
    },
    matchesPlayed: {
      type: Number,
      default: 0,
      min: [0, "Matches played nao pode ser negativo"],
    },
  },
  { timestamps: true }
);

ratingSchema.index(
  { ratingType: 1, playerId: 1, gameMode: 1, format: 1 },
  {
    unique: true,
    partialFilterExpression: {
      ratingType: "PLAYER",
      playerId: { $exists: true, $type: "objectId" },
    },
  }
);

ratingSchema.index(
  { ratingType: 1, deckId: 1, gameMode: 1, format: 1 },
  {
    unique: true,
    partialFilterExpression: {
      ratingType: "DECK",
      deckId: { $exists: true, $type: "objectId" },
    },
  }
);

export const Rating = mongoose.model("Rating", ratingSchema);
