import test from "node:test";
import assert from "node:assert/strict";

import {
  validateMatchCreationInput,
  validateResultConsistency,
} from "../src/service/match.js";

test("criacao valida de match aceita participants do mesmo evento", () => {
  const eventId = "event-1";
  const participants = [
    { eventEntryId: "entry-1" },
    { eventEntryId: "entry-2" },
  ];
  const entries = [
    { _id: "entry-1", eventId },
    { _id: "entry-2", eventId },
  ];

  assert.equal(validateMatchCreationInput(entries, eventId, participants), true);
});

test("erro ao usar entry de outro evento", () => {
  const participants = [
    { eventEntryId: "entry-1" },
    { eventEntryId: "entry-2" },
  ];
  const entries = [
    { _id: "entry-1", eventId: "event-1" },
    { _id: "entry-2", eventId: "event-2" },
  ];

  assert.throws(
    () => validateMatchCreationInput(entries, "event-1", participants),
    /mesmo evento/
  );
});

test("erro ao duplicar participante", () => {
  const eventId = "event-1";
  const participants = [
    { eventEntryId: "entry-1" },
    { eventEntryId: "entry-1" },
  ];
  const entries = [
    { _id: "entry-1", eventId },
    { _id: "entry-1", eventId },
  ];

  assert.throws(
    () => validateMatchCreationInput(entries, eventId, participants),
    /duplicar eventEntryId/
  );
});

test("finalizacao valida de 1v1", () => {
  const participants = [
    {
      eventEntryId: "entry-1",
      resultType: "WIN",
      placement: 1,
      score: 2,
      pointsEarned: 3,
      isWinner: true,
      eliminations: 0,
    },
    {
      eventEntryId: "entry-2",
      resultType: "LOSS",
      placement: 2,
      score: 0,
      pointsEarned: 0,
      isWinner: false,
      eliminations: 0,
    },
  ];

  assert.equal(validateResultConsistency(participants, "ONE_VS_ONE"), true);
});

test("erro em resultado inconsistente", () => {
  const participants = [
    {
      eventEntryId: "entry-1",
      resultType: "WIN",
      placement: 2,
      score: 2,
      pointsEarned: 3,
      isWinner: true,
      eliminations: 0,
    },
    {
      eventEntryId: "entry-2",
      resultType: "LOSS",
      placement: 1,
      score: 1,
      pointsEarned: 0,
      isWinner: false,
      eliminations: 0,
    },
  ];

  assert.throws(
    () => validateResultConsistency(participants, "ONE_VS_ONE"),
    /placement 1/
  );
});

test("commander exige placements unicos e vencedor em placement 1", () => {
  const participants = [
    {
      eventEntryId: "entry-1",
      resultType: "WIN",
      placement: 1,
      score: 3,
      pointsEarned: 5,
      isWinner: true,
      eliminations: 2,
    },
    {
      eventEntryId: "entry-2",
      resultType: "LOSS",
      placement: 2,
      score: 2,
      pointsEarned: 3,
      isWinner: false,
      eliminations: 1,
    },
    {
      eventEntryId: "entry-3",
      resultType: "LOSS",
      placement: 3,
      score: 1,
      pointsEarned: 2,
      isWinner: false,
      eliminations: 0,
    },
    {
      eventEntryId: "entry-4",
      resultType: "LOSS",
      placement: 4,
      score: 0,
      pointsEarned: 1,
      isWinner: false,
      eliminations: 0,
    },
  ];

  assert.equal(validateResultConsistency(participants, "COMMANDER_MULTIPLAYER"), true);
});
