import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import "../src/models/constants.js";
import "../src/models/User.js";
import "../src/models/Player.js";
import "../src/models/Deck.js";
import "../src/models/Event.js";
import "../src/models/Team.js";
import "../src/models/TeamMember.js";
import "../src/models/EventEntry.js";
import "../src/models/Match.js";
import "../src/models/MatchParticipant.js";
import "../src/models/Rating.js";
import "../src/models/RatingHistory.js";

const { Types } = mongoose;

const EventEntry = mongoose.model("EventEntry");
const Rating = mongoose.model("Rating");
const RatingHistory = mongoose.model("RatingHistory");
const TeamMember = mongoose.model("TeamMember");
const MatchParticipant = mongoose.model("MatchParticipant");
const User = mongoose.model("User");

test("EventEntry nao permite PLAYER com teamId preenchido", () => {
  const doc = new EventEntry({
    eventId: new Types.ObjectId(),
    entryType: "PLAYER",
    playerId: new Types.ObjectId(),
    deckId: new Types.ObjectId(),
    teamId: new Types.ObjectId(),
  });

  const error = doc.validateSync();
  assert.ok(error?.errors.teamId);
});

test("EventEntry nao permite TEAM com playerId preenchido", () => {
  const doc = new EventEntry({
    eventId: new Types.ObjectId(),
    entryType: "TEAM",
    playerId: new Types.ObjectId(),
    teamId: new Types.ObjectId(),
  });

  const error = doc.validateSync();
  assert.ok(error?.errors.playerId);
});

test("EventEntry nao permite TEAM com deckId preenchido", () => {
  const doc = new EventEntry({
    eventId: new Types.ObjectId(),
    entryType: "TEAM",
    playerId: null,
    teamId: new Types.ObjectId(),
    deckId: new Types.ObjectId(),
  });

  const error = doc.validateSync();
  assert.ok(error?.errors.teamId || error?.errors.deckId);
});

test("EventEntry nao permite PLAYER sem deckId", () => {
  const doc = new EventEntry({
    eventId: new Types.ObjectId(),
    entryType: "PLAYER",
    playerId: new Types.ObjectId(),
    teamId: null,
  });

  const error = doc.validateSync();
  assert.ok(error?.errors.playerId || error?.errors.deckId);
});

test("EventEntry aceita PLAYER com playerId e deckId preenchidos", () => {
  const doc = new EventEntry({
    eventId: new Types.ObjectId(),
    entryType: "PLAYER",
    playerId: new Types.ObjectId(),
    deckId: new Types.ObjectId(),
    teamId: null,
  });

  const error = doc.validateSync();
  assert.equal(error, undefined);
});

test("Rating nao permite PLAYER sem playerId", () => {
  const doc = new Rating({
    ratingType: "PLAYER",
    gameMode: "ONE_VS_ONE",
    format: "MODERN",
    rating: 1500,
  });

  const error = doc.validateSync();
  assert.ok(error?.errors.playerId);
});

test("Rating nao permite DECK sem deckId", () => {
  const doc = new Rating({
    ratingType: "DECK",
    gameMode: "ONE_VS_ONE",
    format: "MODERN",
    rating: 1500,
  });

  const error = doc.validateSync();
  assert.ok(error?.errors.deckId);
});

test("Rating aceita DECK com deckId preenchido e playerId nulo", () => {
  const doc = new Rating({
    ratingType: "DECK",
    deckId: new Types.ObjectId(),
    playerId: null,
    gameMode: "ONE_VS_ONE",
    format: "MODERN",
    rating: 1500,
  });

  const error = doc.validateSync();
  assert.equal(error, undefined);
});

test("RatingHistory nao permite combinacao inconsistente", () => {
  const doc = new RatingHistory({
    ratingType: "PLAYER",
    deckId: new Types.ObjectId(),
    matchId: new Types.ObjectId(),
    oldRating: 1500,
    newRating: 1512,
    delta: 12,
  });

  const error = doc.validateSync();
  assert.ok(error?.errors.playerId || error?.errors.deckId);
});

test("TeamMember possui indice unico composto por teamId e playerId", () => {
  const indexes = TeamMember.schema.indexes();
  assert.ok(
    indexes.some(([fields, options]) => (
      fields.teamId === 1 &&
      fields.playerId === 1 &&
      options.unique === true
    ))
  );
});

test("MatchParticipant possui indice unico composto por matchId e eventEntryId", () => {
  const indexes = MatchParticipant.schema.indexes();
  assert.ok(
    indexes.some(([fields, options]) => (
      fields.matchId === 1 &&
      fields.eventEntryId === 1 &&
      options.unique === true
    ))
  );
});

test("MatchParticipant nao possui mais deckId", () => {
  assert.equal("deckId" in MatchParticipant.schema.paths, false);
});

test("User aceita cadastro com username email e virtual password", () => {
  const doc = new User({
    username: "admin",
    email: "admin@gmail.com",
  });

  doc.password = "123456";

  const error = doc.validateSync();
  assert.equal(error, undefined);
});
