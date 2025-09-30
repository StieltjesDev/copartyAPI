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
    idParing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Paring",
      required: [true, "Paring é obrigatório"],
    },
    idGamemode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gamemode",
      required: [true, "Gamemode é obrigatório"],
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
