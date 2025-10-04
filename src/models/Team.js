import mongoose from "mongoose";

const teamPlayerSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Nome é obrigatório"] },
    idEvent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: [true, "Team é obrigatório"],
    },
  },
  { timestamps: true }
);

export const TeamPlayer = mongoose.model("teamPlayer", teamPlayerSchema);
