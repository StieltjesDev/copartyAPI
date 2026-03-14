import mongoose from "mongoose";
import { MATCH_RESULT_TYPES } from "./constants.js";
import { EventEntry } from "./EventEntry.js";
import { Match } from "./Match.js";

const matchParticipantSchema = new mongoose.Schema(
  {
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      required: [true, "Match e obrigatorio"],
    },
    eventEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventEntry",
      required: [true, "Event entry e obrigatoria"],
    },
    seatOrder: {
      type: Number,
      min: [1, "Seat order precisa ser maior que zero"],
    },
    resultType: {
      type: String,
      enum: MATCH_RESULT_TYPES,
      default: null,
    },
    placement: {
      type: Number,
      min: [1, "Placement precisa ser maior que zero"],
    },
    score: {
      type: Number,
      default: 0,
    },
    pointsEarned: {
      type: Number,
      default: 0,
    },
    isWinner: {
      type: Boolean,
      default: false,
    },
    eliminations: {
      type: Number,
      min: [0, "Eliminations nao pode ser negativo"],
    },
  },
  { timestamps: true }
);

matchParticipantSchema.index({ matchId: 1, eventEntryId: 1 }, { unique: true });

matchParticipantSchema.pre("validate", async function validateMatchParticipant() {
  if (!this.matchId || !this.eventEntryId) {
    return;
  }

  const [match, eventEntry] = await Promise.all([
    Match.findById(this.matchId).select("eventId").lean(),
    EventEntry.findById(this.eventEntryId).select("eventId").lean(),
  ]);

  if (!match) {
    this.invalidate("matchId", "Match nao encontrada");
    return;
  }

  if (!eventEntry) {
    this.invalidate("eventEntryId", "Event entry nao encontrada");
    return;
  }

  if (String(match.eventId) !== String(eventEntry.eventId)) {
    this.invalidate("eventEntryId", "Event entry precisa pertencer ao mesmo evento da match");
  }

});

export const MatchParticipant = mongoose.model("MatchParticipant", matchParticipantSchema);
