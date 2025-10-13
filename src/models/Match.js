import mongoose from "mongoose";

const matchSchema = new mongoose.Schema(
  {
    round: { type: String, required: [true, "Rodada é obrigatória"] },
    status: { type: String, enum: ["pending", "completed"], default: "pending" },
    idEvent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "Evento é obrigatório"],
    },
  },
  { timestamps: true }
);

export const Match = mongoose.model("Match", matchSchema);
