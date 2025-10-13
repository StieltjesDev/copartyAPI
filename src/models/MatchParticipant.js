import mongoose from "mongoose";

const matchParticipantSchema = new mongoose.Schema(
  {
    participantType: {
      type: String,
      required: [true, "Tipo de Participante é obrigatório"],
      enum: ["Team", "Player"],
    },
    participantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Participante é obrigatório"],
      refPath: "participantType",
    },
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      required: true,
    },
  },
  { timestamps: true }
);

export const MatchParticipant = mongoose.model(
  "MatchParticipant",
  matchParticipantSchema
);
