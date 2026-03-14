import mongoose from "mongoose";

const playerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User e obrigatorio"],
    },
    displayName: {
      type: String,
      required: [true, "Display name e obrigatorio"],
      trim: true,
      maxlength: [60, "Display name precisa ter no maximo 60 caracteres"],
    },
    points: {
      type: Number,
      default: 0,
      min: [0, "Points nao pode ser negativo"],
    },
    wins: {
      type: Number,
      default: 0,
      min: [0, "Wins nao pode ser negativo"],
    },
    losses: {
      type: Number,
      default: 0,
      min: [0, "Losses nao pode ser negativo"],
    },
    draws: {
      type: Number,
      default: 0,
      min: [0, "Draws nao pode ser negativo"],
    },
  },
  { timestamps: true }
);

playerSchema.index({ userId: 1 }, { unique: true });

export const Player = mongoose.model("Player", playerSchema);
