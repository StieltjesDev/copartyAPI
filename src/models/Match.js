import mongoose from "mongoose";
import { MATCH_STATUSES } from "./constants.js";

const matchSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "Event e obrigatorio"],
    },
    round: {
      type: Number,
      required: [true, "Round e obrigatorio"],
      min: [1, "Round precisa ser maior que zero"],
    },
    tableNumber: {
      type: Number,
      min: [1, "Table number precisa ser maior que zero"],
    },
    status: {
      type: String,
      enum: MATCH_STATUSES,
      default: "PENDING",
    },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes precisa ter no maximo 1000 caracteres"],
    },
  },
  { timestamps: true }
);

export const Match = mongoose.model("Match", matchSchema);
