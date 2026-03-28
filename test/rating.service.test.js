import test from "node:test";
import assert from "node:assert/strict";

import { buildRatingUpdates } from "../src/service/rating.js";

test("atualizacao de rating gera delta para player e deck apos match finalizada", () => {
  const updates = buildRatingUpdates({
    event: { gameMode: "ONE_VS_ONE" },
    participants: [
      { eventEntryId: "entry-1", resultType: "WIN" },
      { eventEntryId: "entry-2", resultType: "LOSS" },
    ],
    entries: [
      { _id: "entry-1", playerId: "player-1", deckId: "deck-1" },
      { _id: "entry-2", playerId: "player-2", deckId: "deck-2" },
    ],
    decks: [
      { _id: "deck-1", format: "MODERN" },
      { _id: "deck-2", format: "MODERN" },
    ],
  });

  assert.equal(updates[0].delta, 10);
  assert.equal(updates[1].delta, 0);
  assert.equal(updates[0].format, "MODERN");
});

test("cria estrutura compativel com rating history", () => {
  const updates = buildRatingUpdates({
    event: { gameMode: "ONE_VS_ONE" },
    participants: [{ eventEntryId: "entry-1", resultType: "DRAW" }],
    entries: [{ _id: "entry-1", playerId: "player-1", deckId: "deck-1" }],
    decks: [{ _id: "deck-1", format: "MODERN" }],
  });

  assert.equal(updates[0].delta, 3);
  assert.equal(updates[0].entry.playerId, "player-1");
});

test("commander usa delta baseado em placement", () => {
  const updates = buildRatingUpdates({
    event: { gameMode: "COMMANDER_MULTIPLAYER" },
    participants: [{ eventEntryId: "entry-1", resultType: "WIN", placement: 1 }],
    entries: [{ _id: "entry-1", playerId: "player-1", deckId: "deck-1" }],
    decks: [{ _id: "deck-1", format: "COMMANDER" }],
  });

  assert.equal(updates[0].delta, 10);
});
