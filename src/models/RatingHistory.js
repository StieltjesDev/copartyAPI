import mongoose from "mongoose";
import { RATING_TYPES } from "./constants.js";

const ratingHistorySchema = new mongoose.Schema(
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
        message: "Rating history PLAYER exige playerId preenchido e deckId nulo",
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
        message: "Rating history DECK exige deckId preenchido e playerId nulo",
      },
    },
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      required: [true, "Match e obrigatoria"],
    },
    oldRating: {
      type: Number,
      required: [true, "Old rating e obrigatorio"],
    },
    newRating: {
      type: Number,
      required: [true, "New rating e obrigatorio"],
    },
    delta: {
      type: Number,
      required: [true, "Delta e obrigatorio"],
    },
    calculatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

ratingHistorySchema.index(
  { ratingType: 1, matchId: 1, playerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      ratingType: "PLAYER",
      playerId: { $exists: true, $type: "objectId" },
    },
  }
);

ratingHistorySchema.index(
  { ratingType: 1, matchId: 1, deckId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      ratingType: "DECK",
      deckId: { $exists: true, $type: "objectId" },
    },
  }
);

export const RatingHistory = mongoose.model("RatingHistory", ratingHistorySchema);
