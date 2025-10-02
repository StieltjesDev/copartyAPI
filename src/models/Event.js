import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Nome é obrigatorio"] },
    description: { type: String },
    dateTime: { type: Date, required: [true, "Data e hora é obrigatorio"] },
    status: {
      type: String,
      enum: ["scheduled", "ongoing", "completed"],
      default: "scheduled",
    },
    paring: {
      type: String,
      enum: [
        "swiss",
        "round-robin",
        "single-elimination",
        "double-elimination",
      ],
      required: [true, "Sistema de paring é obrigatorio"],
    },
    gamemode: {
      type: String,
      enum: [
        "standard",
        "modern",
        "commander",
        "draft",
        "sealed",
        "commander500",
        "commander250",
        "commander15",
        "commander imperial",
        "commander gigant of two heads",
        "brawl",
        "historic",
        "pioneer",
        "pauper",
        "vintage",
        "legacy",
      ],
      required: [true, "Gamemode é obrigatorio"],
    },
    idUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User é obrigatório"],
    },
  },
  { timestamps: true }
);

export const Event = mongoose.model("Event", eventSchema);
