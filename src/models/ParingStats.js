import mongoose from "mongoose";

const paringStatsSchema = new mongoose.Schema(
  {
    win: { type: Number },
    losse: { type: Number },
    tie: { type: Number },
    idParing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Paring",
      required: [true, "Paring é obrigatório"],
    },
    idUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Usuário é obrigatório"],
    },
  },
  { timestamps: true }
);

export const ParingStats = mongoose.model(
  "ParingStats",
  paringStatsSchema
);
