import mongoose from "mongoose";

const gamemodeStatsSchema = new mongoose.Schema(
  {
    win: { type: Number },
    losse: { type: Number },
    tie: { type: Number },
    idGamemode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gamemode",
      required: [true, "Gamemode é obrigatório"],
    },
    idUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Usuário é obrigatório"],
    },
  },
  { timestamps: true }
);

export const GamemodeStats = mongoose.model(
  "GamemodeStats",
  gamemodeStatsSchema
);
