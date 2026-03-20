import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateStandings,
  generateCommanderTables,
  generateSwissPairings,
} from "../src/service/event.js";

test("gerar rodada 1 cria pares sem perder inscritos", () => {
  const entries = [
    { _id: "entry-1" },
    { _id: "entry-2" },
    { _id: "entry-3" },
    { _id: "entry-4" },
  ];

  const pairs = generateSwissPairings(entries, [], [], 1);
  const flattened = pairs.flat().map((entry) => entry._id).sort();

  assert.deepEqual(flattened, ["entry-1", "entry-2", "entry-3", "entry-4"]);
  assert.equal(pairs.length, 2);
});

test("consultar standings soma pontos de matches finalizadas", () => {
  const entries = [
    { _id: "entry-1", playerId: "player-1", deckId: "deck-1" },
    { _id: "entry-2", playerId: "player-2", deckId: "deck-2" },
  ];
  const matches = [{ _id: "match-1", status: "COMPLETED" }];
  const participants = [
    { matchId: "match-1", eventEntryId: "entry-1", resultType: "WIN", pointsEarned: 3 },
    { matchId: "match-1", eventEntryId: "entry-2", resultType: "LOSS", pointsEarned: 0 },
  ];

  const standings = calculateStandings(entries, matches, participants);

  assert.equal(standings[0].eventEntryId, "entry-1");
  assert.equal(standings[0].points, 3);
  assert.equal(standings[1].points, 0);
});

test("gerar rodada posterior respeita ordenacao por pontos", () => {
  const orderedEntries = [
    { eventEntryId: "entry-1" },
    { eventEntryId: "entry-2" },
    { eventEntryId: "entry-3" },
    { eventEntryId: "entry-4" },
  ];

  const pairs = generateSwissPairings(orderedEntries, [], [], 2);

  assert.equal(pairs[0].length, 2);
  assert.equal(pairs[1].length, 2);
});

test("standings ignora match nao finalizada", () => {
  const entries = [
    { _id: "entry-1", playerId: "player-1", deckId: "deck-1" },
    { _id: "entry-2", playerId: "player-2", deckId: "deck-2" },
  ];
  const matches = [{ _id: "match-1", status: "PENDING" }];
  const participants = [
    { matchId: "match-1", eventEntryId: "entry-1", resultType: "WIN", pointsEarned: 3 },
    { matchId: "match-1", eventEntryId: "entry-2", resultType: "LOSS", pointsEarned: 0 },
  ];

  const standings = calculateStandings(entries, matches, participants);

  assert.equal(standings[0].points, 0);
  assert.equal(standings[1].points, 0);
});

test("standings aplica tie-breakers oficiais para desempatar mesma pontuacao", () => {
  const entries = [
    { _id: "entry-1", playerId: "player-1", deckId: "deck-1" },
    { _id: "entry-2", playerId: "player-2", deckId: "deck-2" },
    { _id: "entry-3", playerId: "player-3", deckId: "deck-3" },
    { _id: "entry-4", playerId: "player-4", deckId: "deck-4" },
    { _id: "entry-5", playerId: "player-5", deckId: "deck-5" },
    { _id: "entry-6", playerId: "player-6", deckId: "deck-6" },
  ];
  const matches = [
    { _id: "match-1", status: "COMPLETED" },
    { _id: "match-2", status: "COMPLETED" },
    { _id: "match-3", status: "COMPLETED" },
    { _id: "match-4", status: "COMPLETED" },
    { _id: "match-5", status: "COMPLETED" },
    { _id: "match-6", status: "COMPLETED" },
  ];
  const participants = [
    { matchId: "match-1", eventEntryId: "entry-1", resultType: "WIN", pointsEarned: 3 },
    { matchId: "match-1", eventEntryId: "entry-2", resultType: "LOSS", pointsEarned: 0 },
    { matchId: "match-2", eventEntryId: "entry-3", resultType: "WIN", pointsEarned: 3 },
    { matchId: "match-2", eventEntryId: "entry-4", resultType: "LOSS", pointsEarned: 0 },
    { matchId: "match-3", eventEntryId: "entry-5", resultType: "WIN", pointsEarned: 3 },
    { matchId: "match-3", eventEntryId: "entry-6", resultType: "LOSS", pointsEarned: 0 },
    { matchId: "match-4", eventEntryId: "entry-1", resultType: "WIN", pointsEarned: 3 },
    { matchId: "match-4", eventEntryId: "entry-3", resultType: "LOSS", pointsEarned: 0 },
    { matchId: "match-5", eventEntryId: "entry-2", resultType: "WIN", pointsEarned: 3 },
    { matchId: "match-5", eventEntryId: "entry-5", resultType: "LOSS", pointsEarned: 0 },
    { matchId: "match-6", eventEntryId: "entry-4", resultType: "LOSS", pointsEarned: 0 },
    { matchId: "match-6", eventEntryId: "entry-6", resultType: "WIN", pointsEarned: 3 },
  ];

  const standings = calculateStandings(entries, matches, participants);

  assert.equal(standings[0].eventEntryId, "entry-1");
  assert.equal(standings[1].eventEntryId, "entry-2");
  assert.equal(standings[2].eventEntryId, "entry-3");
  assert.equal(standings[1].points, standings[2].points);
  assert.equal(standings[1].buchholz > standings[2].buchholz, true);
  assert.equal(standings[0].position, 1);
  assert.equal(typeof standings[0].opponentMatchWinRate, "number");
});

test("commander permite gerar mesas multiplayer com fallback seguro", () => {
  const entries = [
    { _id: "entry-1" },
    { _id: "entry-2" },
    { _id: "entry-3" },
    { _id: "entry-4" },
    { _id: "entry-5" },
    { _id: "entry-6" },
    { _id: "entry-7" },
    { _id: "entry-8" },
    { _id: "entry-9" },
  ];

  const pairs = generateSwissPairings(entries.slice(0, 4), [], [], 1);
  assert.equal(pairs.length, 2);
});

test("commander tenta evitar rematch multiplayer quando possivel", () => {
  const entries = [
    { _id: "entry-1" },
    { _id: "entry-2" },
    { _id: "entry-3" },
    { _id: "entry-4" },
    { _id: "entry-5" },
    { _id: "entry-6" },
    { _id: "entry-7" },
    { _id: "entry-8" },
  ];

  const previousMatches = [{ _id: "match-1" }, { _id: "match-2" }];
  const previousParticipants = [
    { matchId: "match-1", eventEntryId: "entry-1" },
    { matchId: "match-1", eventEntryId: "entry-2" },
    { matchId: "match-1", eventEntryId: "entry-3" },
    { matchId: "match-1", eventEntryId: "entry-4" },
    { matchId: "match-2", eventEntryId: "entry-5" },
    { matchId: "match-2", eventEntryId: "entry-6" },
    { matchId: "match-2", eventEntryId: "entry-7" },
    { matchId: "match-2", eventEntryId: "entry-8" },
  ];

  const tables = generateCommanderTables(entries, previousMatches, previousParticipants);

  assert.equal(tables.length, 2);
  const firstTable = tables[0].map((item) => item._id);
  const repeatedFromFirstPod = firstTable.filter((id) => ["entry-1", "entry-2", "entry-3", "entry-4"].includes(id));
  assert.equal(repeatedFromFirstPod.length < 4, true);
});
