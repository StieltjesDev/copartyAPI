import mongoose from "mongoose";
import { EVENT_ENTRY_STATUSES, EVENT_ENTRY_TYPES } from "./constants.js";
import { Deck } from "./Deck.js";
import { Event } from "./Event.js";
import { Player } from "./Player.js";
import { Team } from "./Team.js";

const eventEntrySchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "Event e obrigatorio"],
    },
    entryType: {
      type: String,
      required: [true, "Entry type e obrigatorio"],
      enum: EVENT_ENTRY_TYPES,
    },
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      default: null,
      validate: {
        validator(value) {
          if (this.entryType === "PLAYER") {
            return Boolean(value) && this.teamId === null && Boolean(this.deckId);
          }

          return value === null;
        },
        message: "PLAYER exige playerId preenchido, teamId nulo e deckId preenchido",
      },
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
      validate: {
        validator(value) {
          if (this.entryType === "TEAM") {
            return Boolean(value) && this.playerId === null && this.deckId === null;
          }

          return value === null;
        },
        message: "TEAM exige teamId preenchido, playerId nulo e deckId nulo",
      },
    },
    deckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deck",
      default: null,
      validate: {
        validator(value) {
          if (this.entryType === "PLAYER") {
            return Boolean(value) && this.teamId === null;
          }

          return value === null;
        },
        message: "PLAYER exige deckId preenchido e TEAM exige deckId nulo",
      },
    },
    seed: {
      type: Number,
      min: [1, "Seed precisa ser maior que zero"],
    },
    status: {
      type: String,
      enum: EVENT_ENTRY_STATUSES,
      default: "REGISTERED",
    },
  },
  { timestamps: true }
);

eventEntrySchema.index(
  { eventId: 1, playerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      entryType: "PLAYER",
      playerId: { $exists: true, $type: "objectId" },
    },
  }
);

eventEntrySchema.index(
  { eventId: 1, teamId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      entryType: "TEAM",
      teamId: { $exists: true, $type: "objectId" },
    },
  }
);

eventEntrySchema.pre("validate", async function validateEventEntry() {
  const eventExists = await Event.exists({ _id: this.eventId });

  if (!eventExists) {
    this.invalidate("eventId", "Event nao encontrado");
  }

  if (this.entryType === "PLAYER" && this.playerId) {
    const [playerExists, deck] = await Promise.all([
      Player.exists({ _id: this.playerId }),
      this.deckId ? Deck.findById(this.deckId).select("playerId").lean() : null,
    ]);

    if (!playerExists) {
      this.invalidate("playerId", "Player nao encontrado");
    }

    if (!deck) {
      this.invalidate("deckId", "Deck nao encontrado");
      return;
    }

    if (String(deck.playerId) !== String(this.playerId)) {
      this.invalidate("deckId", "Deck precisa pertencer ao mesmo player da event entry");
    }
  }

  if (this.entryType === "TEAM" && this.teamId) {
    const team = await Team.findById(this.teamId).select("eventId").lean();

    if (!team) {
      this.invalidate("teamId", "Team nao encontrado");
      return;
    }

    if (String(team.eventId) !== String(this.eventId)) {
      this.invalidate("teamId", "Team precisa pertencer ao mesmo evento da event entry");
    }
  }
});

export const EventEntry = mongoose.model("EventEntry", eventEntrySchema);
