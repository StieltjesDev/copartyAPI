import mongoose from "mongoose";

const StatsSchema = new mongoose.Schema(
  {
    win: { type: Number },
    losse: { type: Number },
    tie: { type: Number },
    type: { type: String, enum: ["gamemode", "deck", "paring"] },
    idUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Usuário é obrigatório"],
    },
  },
  { timestamps: true }
);

export const Stats = mongoose.model(
  "Stats",
  StatsSchema
);
