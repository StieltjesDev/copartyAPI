import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import { createApp } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Deck } from "../src/models/Deck.js";
import { Event } from "../src/models/Event.js";
import { EventEntry } from "../src/models/EventEntry.js";
import { Match } from "../src/models/Match.js";
import { MatchParticipant } from "../src/models/MatchParticipant.js";
import { Player } from "../src/models/Player.js";
import { Rating } from "../src/models/Rating.js";
import { RatingHistory } from "../src/models/RatingHistory.js";
import { User } from "../src/models/User.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function makeId(prefix, counter) {
  return `${prefix}-${counter.value++}`;
}

function matchesFilter(item, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$in" in expected) {
        return expected.$in.map(String).includes(String(item[key]));
      }

      if ("$or" in expected) {
        return expected.$or.some((option) => matchesFilter(item, option));
      }
    }

    return String(item[key]) === String(expected);
  });
}

function query(value) {
  let current = value;
  return {
    select() {
      return this;
    },
    populate() {
      return this;
    },
    sort(spec) {
      if (Array.isArray(current)) {
        const [[field, direction]] = Object.entries(spec);
        current = [...current].sort((left, right) =>
          direction >= 0
            ? (left[field] > right[field] ? 1 : -1)
            : (left[field] < right[field] ? 1 : -1)
        );
      }
      return this;
    },
    lean() {
      return Promise.resolve(clone(current));
    },
    then(resolve, reject) {
      return Promise.resolve(current).then(resolve, reject);
    },
  };
}

function attachSave(document, collection, store) {
  document.save = async function save() {
    const index = store[collection].findIndex((item) => String(item._id) === String(this._id));
    const plain = clone(this);
    delete plain.save;
    if (index >= 0) {
      store[collection][index] = plain;
    } else {
      store[collection].push(plain);
    }
    return this;
  };
  return document;
}

function setupInMemoryPersistence() {
  const counter = { value: 1 };
  const store = {
    users: [],
    players: [],
    decks: [],
    events: [],
    entries: [],
    matches: [],
    participants: [],
    ratings: [],
    histories: [],
    audits: [],
  };

  User.prototype.save = async function saveUser() {
    this._id ||= makeId("user", counter);
    if (this._plainPassword) {
      this.passwordHash = `hashed:${this._plainPassword}`;
    }
    this.createdAt ||= new Date().toISOString();
    store.users.push({
      _id: this._id,
      username: this.username,
      email: this.email ?? null,
      role: this.role ?? "user",
      passwordHash: this.passwordHash,
      createdAt: this.createdAt,
    });
    return this;
  };
  User.prototype.comparePassword = async function comparePassword(password) {
    return this.passwordHash === `hashed:${password}`;
  };
  User.find = () => query(store.users);
  User.findById = (id) => query(store.users.find((item) => String(item._id) === String(id)) ?? null);
  User.findOne = (filter) => {
    const user = store.users.find((item) => {
      if (filter.$or) {
        return filter.$or.some((option) => matchesFilter(item, option));
      }
      return matchesFilter(item, filter);
    }) ?? null;
    return query(user ? {
      ...user,
      comparePassword: async (password) => user.passwordHash === `hashed:${password}`,
    } : null);
  };
  User.findOneAndDelete = async (filter) => {
    const index = store.users.findIndex((item) => matchesFilter(item, filter));
    if (index === -1) return null;
    return store.users.splice(index, 1)[0];
  };

  Player.prototype.save = async function savePlayer() {
    this._id ||= makeId("player", counter);
    this.createdAt ||= new Date().toISOString();
    store.players.push({
      _id: this._id,
      userId: this.userId,
      displayName: this.displayName,
      points: this.points ?? 0,
      wins: this.wins ?? 0,
      losses: this.losses ?? 0,
      draws: this.draws ?? 0,
      createdAt: this.createdAt,
    });
    return this;
  };
  Player.find = () => query(store.players);
  Player.findOne = (filter) => query(store.players.find((item) => matchesFilter(item, filter)) ?? null);
  Player.findById = (id) => query(store.players.find((item) => String(item._id) === String(id)) ?? null);
  Player.findByIdAndUpdate = async (id, update) => {
    const player = store.players.find((item) => String(item._id) === String(id));
    if (!player) return null;
    if (update.$inc) {
      for (const [key, value] of Object.entries(update.$inc)) {
        player[key] = (player[key] ?? 0) + value;
      }
    } else {
      Object.assign(player, update);
    }
    return player;
  };

  Deck.prototype.save = async function saveDeck() {
    this._id ||= makeId("deck", counter);
    this.createdAt ||= new Date().toISOString();
    store.decks.push({
      _id: this._id,
      playerId: this.playerId,
      name: this.name,
      commander: this.commander ?? null,
      format: this.format,
      link: this.link ?? null,
      isActive: this.isActive ?? true,
      createdAt: this.createdAt,
    });
    return this;
  };
  Deck.find = (filter = {}) => query(store.decks.filter((item) => matchesFilter(item, filter)));
  Deck.findById = (id) => query(store.decks.find((item) => String(item._id) === String(id)) ?? null);
  Deck.findByIdAndUpdate = async (id, update) => {
    const deck = store.decks.find((item) => String(item._id) === String(id));
    if (!deck) return null;
    Object.assign(deck, update);
    return deck;
  };
  Deck.findByIdAndDelete = async (id) => {
    const index = store.decks.findIndex((item) => String(item._id) === String(id));
    if (index === -1) return null;
    return store.decks.splice(index, 1)[0];
  };

  Event.prototype.save = async function saveEvent() {
    this._id ||= makeId("event", counter);
    this.createdAt ||= new Date().toISOString();
    store.events.push({
      _id: this._id,
      name: this.name,
      description: this.description ?? null,
      dateTime: this.dateTime,
      pairingType: this.pairingType,
      status: this.status ?? "DRAFT",
      gameMode: this.gameMode,
      maxPlayers: this.maxPlayers ?? null,
      createdByUserId: this.createdByUserId,
      createdAt: this.createdAt,
    });
    return this;
  };
  Event.find = (filter = {}) => query(store.events.filter((item) => matchesFilter(item, filter)));
  Event.findById = (id) => {
    const event = store.events.find((item) => String(item._id) === String(id)) ?? null;
    return query(event ? attachSave({ ...event }, "events", store) : null);
  };
  Event.findByIdAndUpdate = async (id, update) => {
    const event = store.events.find((item) => String(item._id) === String(id));
    if (!event) return null;
    Object.assign(event, update);
    return event;
  };
  Event.findByIdAndDelete = async (id) => {
    const index = store.events.findIndex((item) => String(item._id) === String(id));
    if (index === -1) return null;
    return store.events.splice(index, 1)[0];
  };
  Event.exists = async (filter) => store.events.some((item) => matchesFilter(item, filter));

  EventEntry.prototype.save = async function saveEntry() {
    this._id ||= makeId("entry", counter);
    this.createdAt ||= new Date().toISOString();
    store.entries.push({
      _id: this._id,
      eventId: this.eventId,
      entryType: this.entryType,
      playerId: this.playerId ?? null,
      teamId: this.teamId ?? null,
      deckId: this.deckId ?? null,
      seed: this.seed ?? null,
      status: this.status ?? "REGISTERED",
      createdAt: this.createdAt,
    });
    return this;
  };
  EventEntry.find = (filter = {}) => query(store.entries.filter((item) => matchesFilter(item, filter)));
  EventEntry.findOne = (filter = {}) => query(store.entries.find((item) => matchesFilter(item, filter)) ?? null);
  EventEntry.findById = (id) => query(store.entries.find((item) => String(item._id) === String(id)) ?? null);
  EventEntry.findOneAndDelete = async (filter) => {
    const index = store.entries.findIndex((item) => matchesFilter(item, filter));
    if (index === -1) return null;
    return store.entries.splice(index, 1)[0];
  };
  EventEntry.countDocuments = async (filter = {}) => store.entries.filter((item) => matchesFilter(item, filter)).length;

  Match.create = async (payload) => {
    const match = {
      _id: makeId("match", counter),
      createdAt: new Date().toISOString(),
      ...payload,
    };
    store.matches.push(match);
    return match;
  };
  Match.find = (filter = {}) => query(store.matches.filter((item) => matchesFilter(item, filter)));
  Match.findById = (id) => {
    const match = store.matches.find((item) => String(item._id) === String(id)) ?? null;
    return query(match ? attachSave({ ...match }, "matches", store) : null);
  };

  MatchParticipant.insertMany = async (payloads) => {
    for (const payload of payloads) {
      store.participants.push({
        _id: makeId("participant", counter),
        ...payload,
      });
    }
  };
  MatchParticipant.find = (filter = {}) => query(store.participants.filter((item) => matchesFilter(item, filter)));
  MatchParticipant.findOneAndUpdate = async (filter, update) => {
    const participant = store.participants.find((item) => matchesFilter(item, filter));
    if (!participant) return null;
    Object.assign(participant, update);
    return participant;
  };

  Rating.findOne = async (filter) => {
    const rating = store.ratings.find((item) => matchesFilter(item, filter)) ?? null;
    return rating ? attachSave({ ...rating }, "ratings", store) : null;
  };
  Rating.create = async (payload) => {
    const rating = attachSave({
      _id: makeId("rating", counter),
      createdAt: new Date().toISOString(),
      ...payload,
    }, "ratings", store);
    store.ratings.push(clone(rating));
    return rating;
  };
  Rating.find = (filter = {}) => query(store.ratings.filter((item) => matchesFilter(item, filter)));
  Rating.deleteMany = async () => {
    store.ratings.length = 0;
  };

  RatingHistory.exists = async (filter) => store.histories.some((item) => matchesFilter(item, filter));
  RatingHistory.insertMany = async (payloads) => {
    for (const payload of payloads) {
      store.histories.push({
        _id: makeId("history", counter),
        createdAt: new Date().toISOString(),
        ...payload,
      });
    }
  };
  RatingHistory.deleteMany = async () => {
    store.histories.length = 0;
  };

  Player.updateMany = async (filter, update) => {
    for (const player of store.players.filter((item) => matchesFilter(item, filter))) {
      Object.assign(player, update);
    }
  };

  AuditLog.create = async (payload) => {
    const audit = {
      _id: makeId("audit", counter),
      createdAt: new Date().toISOString(),
      ...payload,
    };
    store.audits.push(audit);
    return audit;
  };
  AuditLog.find = (filter = {}) => query(store.audits.filter((item) => matchesFilter(item, filter)));

  return store;
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const data = await response.json();
  return { response, data };
}

async function createUserAndSession(baseUrl, { username, email, role = "user", displayName, deckName, format = "MODERN", commander = null }) {
  await request(baseUrl, "/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username,
      email,
      password: "123456",
      role,
    }),
  });

  const login = await request(baseUrl, "/api/users/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: username, password: "123456" }),
  });

  const cookie = login.response.headers.get("set-cookie");

  const player = await request(baseUrl, "/api/players", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ displayName }),
  });

  const deck = await request(baseUrl, "/api/decks/me", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: deckName,
      format,
      commander,
      link: `https://example.com/${username}-deck`,
    }),
  });

  return { cookie, player: player.data, deck: deck.data };
}

test("fluxo HTTP completo do MVP 1v1", async () => {
  setupInMemoryPersistence();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await request(baseUrl, "/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "organizer",
        email: "org@test.com",
        password: "123456",
        role: "admin",
      }),
    });

    const login = await request(baseUrl, "/api/users/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "organizer", password: "123456" }),
    });

    const cookie = login.response.headers.get("set-cookie");
    assert.ok(cookie);

    const playerResponse = await request(baseUrl, "/api/players", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({ displayName: "Organizer Player" }),
    });
    assert.equal(playerResponse.response.status, 201);

    const deckResponse = await request(baseUrl, "/api/decks/me", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        name: "Deck A",
        format: "MODERN",
        commander: null,
        link: "https://example.com/deck-a",
      }),
    });
    assert.equal(deckResponse.response.status, 201);

    const eventResponse = await request(baseUrl, "/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        name: "MVP Cup",
        description: "Evento de teste",
        dateTime: "2099-01-01T10:00:00.000Z",
        pairingType: "SWISS",
        status: "SCHEDULED",
        gameMode: "ONE_VS_ONE",
        maxPlayers: 16,
      }),
    });
    assert.equal(eventResponse.response.status, 201);
    const eventId = eventResponse.data.id;

    await request(baseUrl, "/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "player2",
        email: "p2@test.com",
        password: "123456",
        role: "user",
      }),
    });
    const login2 = await request(baseUrl, "/api/users/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "player2", password: "123456" }),
    });
    const cookie2 = login2.response.headers.get("set-cookie");

    await request(baseUrl, "/api/players", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie2 },
      body: JSON.stringify({ displayName: "Player Two" }),
    });
    const deck2 = await request(baseUrl, "/api/decks/me", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie2 },
      body: JSON.stringify({
        name: "Deck B",
        format: "MODERN",
        commander: null,
        link: "https://example.com/deck-b",
      }),
    });

    const join1 = await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ deckId: deckResponse.data._id }),
    });
    assert.equal(join1.response.status, 201);

    const join2 = await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie2 },
      body: JSON.stringify({ deckId: deck2.data._id }),
    });
    assert.equal(join2.response.status, 201);

    const round = await request(baseUrl, `/api/events/${eventId}/rounds/1/generate`, {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(round.response.status, 201);
    assert.equal(round.data.length, 1);

    const matchId = round.data[0]._id;
    const entries = await request(baseUrl, `/api/events/${eventId}/entries`, {
      headers: { cookie },
    });

    const [entry1, entry2] = entries.data;
    const result = await request(baseUrl, `/api/matches/${matchId}/result`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        participants: [
          {
            eventEntryId: entry1._id,
            resultType: "WIN",
            placement: 1,
            score: 2,
            pointsEarned: 3,
            isWinner: true,
            eliminations: 0,
          },
          {
            eventEntryId: entry2._id,
            resultType: "LOSS",
            placement: 2,
            score: 0,
            pointsEarned: 0,
            isWinner: false,
            eliminations: 0,
          },
        ],
      }),
    });
    assert.equal(result.response.status, 200);

    const complete = await request(baseUrl, `/api/matches/${matchId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    assert.equal(complete.response.status, 200);

    const closeRound = await request(baseUrl, `/api/events/${eventId}/rounds/1/close`, {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(closeRound.response.status, 200);

    const standings = await request(baseUrl, `/api/events/${eventId}/standings`, {
      headers: { cookie },
    });
    assert.equal(standings.response.status, 200);
    assert.equal(standings.data[0].points, 3);

    const rankings = await request(baseUrl, "/api/rankings/players?gameMode=ONE_VS_ONE", {
      headers: { cookie },
    });
    assert.equal(rankings.response.status, 200);

    const reopen = await request(baseUrl, `/api/matches/${matchId}/reopen`, {
      method: "PATCH",
      headers: { cookie },
    });
    assert.equal(reopen.response.status, 200);

    const rebuild = await request(baseUrl, "/api/admin/rebuild", {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(rebuild.response.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("fluxo HTTP completo Commander multiplayer", async () => {
  setupInMemoryPersistence();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const cookies = [];
    const deckIds = [];

    for (let index = 1; index <= 4; index += 1) {
      await request(baseUrl, "/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: `cmdr${index}`,
          email: `cmdr${index}@test.com`,
          password: "123456",
          role: index === 1 ? "admin" : "user",
        }),
      });

      const login = await request(baseUrl, "/api/users/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login: `cmdr${index}`, password: "123456" }),
      });
      const cookie = login.response.headers.get("set-cookie");
      cookies.push(cookie);

      await request(baseUrl, "/api/players", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ displayName: `Commander ${index}` }),
      });

      const deck = await request(baseUrl, "/api/decks/me", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          name: `Commander Deck ${index}`,
          format: "COMMANDER",
          commander: `Commander Card ${index}`,
          link: `https://example.com/commander-${index}`,
        }),
      });
      deckIds.push(deck.data._id);
    }

    const eventResponse = await request(baseUrl, "/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookies[0],
      },
      body: JSON.stringify({
        name: "Commander Night",
        description: "Mesa multiplayer",
        dateTime: "2099-01-02T10:00:00.000Z",
        pairingType: "SWISS",
        status: "SCHEDULED",
        gameMode: "COMMANDER_MULTIPLAYER",
        maxPlayers: 16,
      }),
    });
    const eventId = eventResponse.data.id;

    for (let index = 0; index < 4; index += 1) {
      const join = await request(baseUrl, `/api/events/${eventId}/entries`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookies[index] },
        body: JSON.stringify({ deckId: deckIds[index] }),
      });
      assert.equal(join.response.status, 201);
    }

    const round = await request(baseUrl, `/api/events/${eventId}/rounds/1/generate`, {
      method: "POST",
      headers: { cookie: cookies[0] },
    });
    assert.equal(round.response.status, 201);
    assert.equal(round.data.length, 1);

    const matchId = round.data[0]._id;
    const entries = await request(baseUrl, `/api/events/${eventId}/entries`, {
      headers: { cookie: cookies[0] },
    });

    const result = await request(baseUrl, `/api/matches/${matchId}/result`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookies[0] },
      body: JSON.stringify({
        participants: entries.data.map((entry, index) => ({
          eventEntryId: entry._id,
          resultType: index === 0 ? "WIN" : "LOSS",
          placement: index + 1,
          score: 4 - index,
          pointsEarned: [5, 3, 2, 1][index],
          isWinner: index === 0,
          eliminations: index === 0 ? 2 : 0,
        })),
      }),
    });
    assert.equal(result.response.status, 200);

    const complete = await request(baseUrl, `/api/matches/${matchId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookies[0] },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    assert.equal(complete.response.status, 200);

    const closeRound = await request(baseUrl, `/api/events/${eventId}/rounds/1/close`, {
      method: "POST",
      headers: { cookie: cookies[0] },
    });
    assert.equal(closeRound.response.status, 200);

    const standings = await request(baseUrl, `/api/events/${eventId}/standings`, {
      headers: { cookie: cookies[0] },
    });
    assert.equal(standings.response.status, 200);
    assert.equal(standings.data[0].points, 5);

    const rankings = await request(baseUrl, "/api/rankings/players?gameMode=COMMANDER_MULTIPLAYER", {
      headers: { cookie: cookies[0] },
    });
    assert.equal(rankings.response.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("fluxos HTTP negativos de autorizacao e estado invalido", async () => {
  const store = setupInMemoryPersistence();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const organizer = await createUserAndSession(baseUrl, {
      username: "neg-organizer",
      email: "neg-organizer@test.com",
      role: "admin",
      displayName: "Neg Organizer",
      deckName: "Neg Deck A",
    });
    const outsider = await createUserAndSession(baseUrl, {
      username: "neg-outsider",
      email: "neg-outsider@test.com",
      role: "user",
      displayName: "Neg Outsider",
      deckName: "Neg Deck B",
    });

    const eventResponse = await request(baseUrl, "/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: organizer.cookie,
      },
      body: JSON.stringify({
        name: "Negative Cup",
        description: "Evento para cenarios invalidos",
        dateTime: "2099-01-03T10:00:00.000Z",
        pairingType: "SWISS",
        status: "SCHEDULED",
        gameMode: "ONE_VS_ONE",
        maxPlayers: 16,
      }),
    });
    const eventId = eventResponse.data.id;

    await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: organizer.cookie },
      body: JSON.stringify({ deckId: organizer.deck._id }),
    });

    await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: outsider.cookie },
      body: JSON.stringify({ deckId: outsider.deck._id }),
    });

    const forbiddenRound = await request(baseUrl, `/api/events/${eventId}/rounds/1/generate`, {
      method: "POST",
      headers: { cookie: outsider.cookie },
    });
    assert.equal(forbiddenRound.response.status, 403);
    assert.equal(forbiddenRound.data.error.code, "FORBIDDEN");

    const round = await request(baseUrl, `/api/events/${eventId}/rounds/1/generate`, {
      method: "POST",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(round.response.status, 201);
    const matchId = round.data[0]._id;

    const forbiddenResult = await request(baseUrl, `/api/matches/${matchId}/result`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: outsider.cookie },
      body: JSON.stringify({
        participants: [
          {
            eventEntryId: store.entries[0]._id,
            resultType: "WIN",
            placement: 1,
            score: 2,
            pointsEarned: 3,
            isWinner: true,
            eliminations: 0,
          },
          {
            eventEntryId: store.entries[1]._id,
            resultType: "LOSS",
            placement: 2,
            score: 0,
            pointsEarned: 0,
            isWinner: false,
            eliminations: 0,
          },
        ],
      }),
    });
    assert.equal(forbiddenResult.response.status, 403);

    const closePending = await request(baseUrl, `/api/events/${eventId}/rounds/1/close`, {
      method: "POST",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(closePending.response.status, 409);
    assert.equal(closePending.data.error.code, "INVALID_STATE");

    const invalidPayload = await request(baseUrl, `/api/matches/${matchId}/result`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: organizer.cookie },
      body: JSON.stringify({
        participants: [
          {
            eventEntryId: store.entries[0]._id,
            resultType: "WIN",
            placement: 1,
            score: 2,
            pointsEarned: 3,
            isWinner: true,
            eliminations: 0,
          },
          {
            eventEntryId: store.entries[1]._id,
            resultType: "LOSS",
            placement: 1,
            score: 0,
            pointsEarned: 0,
            isWinner: false,
            eliminations: 0,
          },
        ],
      }),
    });
    assert.equal(invalidPayload.response.status, 400);
    assert.equal(invalidPayload.data.error.code, "VALIDATION_ERROR");

    const validResult = await request(baseUrl, `/api/matches/${matchId}/result`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: organizer.cookie },
      body: JSON.stringify({
        participants: [
          {
            eventEntryId: store.entries[0]._id,
            resultType: "WIN",
            placement: 1,
            score: 2,
            pointsEarned: 3,
            isWinner: true,
            eliminations: 0,
          },
          {
            eventEntryId: store.entries[1]._id,
            resultType: "LOSS",
            placement: 2,
            score: 0,
            pointsEarned: 0,
            isWinner: false,
            eliminations: 0,
          },
        ],
      }),
    });
    assert.equal(validResult.response.status, 200);

    const duplicateResult = await request(baseUrl, `/api/matches/${matchId}/result`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: organizer.cookie },
      body: JSON.stringify({
        participants: [
          {
            eventEntryId: store.entries[0]._id,
            resultType: "WIN",
            placement: 1,
            score: 2,
            pointsEarned: 3,
            isWinner: true,
            eliminations: 0,
          },
          {
            eventEntryId: store.entries[1]._id,
            resultType: "LOSS",
            placement: 2,
            score: 0,
            pointsEarned: 0,
            isWinner: false,
            eliminations: 0,
          },
        ],
      }),
    });
    assert.equal(duplicateResult.response.status, 409);

    const invalidTransition = await request(baseUrl, `/api/matches/${matchId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: organizer.cookie },
      body: JSON.stringify({ status: "UNKNOWN" }),
    });
    assert.equal(invalidTransition.response.status, 400);

    const complete = await request(baseUrl, `/api/matches/${matchId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: organizer.cookie },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    assert.equal(complete.response.status, 200);

    const reopen = await request(baseUrl, `/api/matches/${matchId}/reopen`, {
      method: "PATCH",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(reopen.response.status, 200);

    const invalidReopen = await request(baseUrl, `/api/matches/${matchId}/reopen`, {
      method: "PATCH",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(invalidReopen.response.status, 409);

    const forbiddenRebuild = await request(baseUrl, `/api/admin/rebuild/event/${eventId}`, {
      method: "POST",
      headers: { cookie: outsider.cookie },
    });
    assert.equal(forbiddenRebuild.response.status, 403);

    assert.ok(store.audits.length > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("logout limpa cookie e invalida check-auth", async () => {
  setupInMemoryPersistence();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await request(baseUrl, "/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "logout-user",
        email: "logout@test.com",
        password: "123456",
        role: "user",
      }),
    });

    const login = await request(baseUrl, "/api/users/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "logout-user", password: "123456" }),
    });

    const cookie = login.response.headers.get("set-cookie");
    assert.ok(cookie);

    const beforeLogout = await request(baseUrl, "/api/users/check-auth", {
      headers: { cookie },
    });
    assert.equal(beforeLogout.response.status, 200);

    const logout = await request(baseUrl, "/api/users/logout", {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(logout.response.status, 200);
    assert.equal(logout.data.message, "Logout realizado com sucesso!");
    assert.match(logout.response.headers.get("set-cookie") || "", /token=;/);

    const afterLogout = await request(baseUrl, "/api/users/check-auth", {
      headers: { cookie: "token=" },
    });
    assert.equal(afterLogout.response.status, 403);
    assert.equal(afterLogout.data.error.code, "FORBIDDEN");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("login retorna erro controlado para usuario inconsistente sem passwordHash", async () => {
  const store = setupInMemoryPersistence();
  store.users.push({
    _id: "broken-user",
    username: "broken",
    email: "broken@test.com",
    role: "user",
    passwordHash: undefined,
    createdAt: new Date().toISOString(),
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const login = await request(baseUrl, "/api/users/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "broken@test.com", password: "123456" }),
    });

    assert.equal(login.response.status, 409);
    assert.equal(login.data.error.code, "INVALID_STATE");
    assert.equal(login.data.error.message, "Usuario sem hash de senha cadastrado");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("login retorna erro controlado quando JWT_SECRET nao esta configurado", async () => {
  setupInMemoryPersistence();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const originalSecret = process.env.JWT_SECRET;

  try {
    await request(baseUrl, "/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "no-secret-user",
        email: "no-secret@test.com",
        password: "123456",
        role: "user",
      }),
    });

    delete process.env.JWT_SECRET;

    const login = await request(baseUrl, "/api/users/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "no-secret@test.com", password: "123456" }),
    });

    assert.equal(login.response.status, 500);
    assert.equal(login.data.error.code, "CONFIGURATION_ERROR");
    assert.equal(login.data.error.message, "JWT_SECRET nao configurado");
  } finally {
    process.env.JWT_SECRET = originalSecret;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("inicio, cancelamento e finalizacao de evento seguem o fluxo operacional", async () => {
  const store = setupInMemoryPersistence();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const organizer = await createUserAndSession(baseUrl, {
      username: "finish-organizer",
      email: "finish-organizer@test.com",
      role: "admin",
      displayName: "Finish Organizer",
      deckName: "Finish Deck A",
    });
    const outsider = await createUserAndSession(baseUrl, {
      username: "finish-outsider",
      email: "finish-outsider@test.com",
      role: "user",
      displayName: "Finish Outsider",
      deckName: "Finish Deck B",
    });

    const eventResponse = await request(baseUrl, "/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: organizer.cookie,
      },
      body: JSON.stringify({
        name: "Finish Cup",
        description: "Evento para finalizar",
        dateTime: "2099-01-05T10:00:00.000Z",
        pairingType: "SWISS",
        gameMode: "ONE_VS_ONE",
        maxPlayers: 16,
      }),
    });
    const eventId = eventResponse.data.id;

    await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: organizer.cookie },
      body: JSON.stringify({ deckId: organizer.deck._id }),
    });

    await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: outsider.cookie },
      body: JSON.stringify({ deckId: outsider.deck._id }),
    });

    const forbiddenStart = await request(baseUrl, `/api/events/${eventId}/start`, {
      method: "PATCH",
      headers: { cookie: outsider.cookie },
    });
    assert.equal(forbiddenStart.response.status, 403);

    const start = await request(baseUrl, `/api/events/${eventId}/start`, {
      method: "PATCH",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(start.response.status, 200);
    assert.equal(start.data.event.status, "ONGOING");

    const finish = await request(baseUrl, `/api/events/${eventId}/finish`, {
      method: "PATCH",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(finish.response.status, 200);
    assert.equal(finish.data.message, "Evento finalizado com sucesso!");
    assert.equal(finish.data.event.status, "COMPLETED");

    const alreadyCompleted = await request(baseUrl, `/api/events/${eventId}/finish`, {
      method: "PATCH",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(alreadyCompleted.response.status, 409);
    assert.equal(alreadyCompleted.data.error.message, "Evento ja finalizado");

    const cancellableEventResponse = await request(baseUrl, "/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: organizer.cookie,
      },
      body: JSON.stringify({
        name: "Draft Cup",
        description: "Evento para cancelamento",
        dateTime: "2099-01-06T10:00:00.000Z",
        pairingType: "SWISS",
        gameMode: "ONE_VS_ONE",
        maxPlayers: 8,
        isDraft: true,
      }),
    });
    const cancellableEventId = cancellableEventResponse.data.id;

    const cancel = await request(baseUrl, `/api/events/${cancellableEventId}/cancel`, {
      method: "PATCH",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(cancel.response.status, 200);
    assert.equal(cancel.data.event.status, "CANCELLED");

    const overdueEventResponse = await request(baseUrl, "/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: organizer.cookie,
      },
      body: JSON.stringify({
        name: "Overdue Draft Cup",
        description: "Evento vencido",
        dateTime: "2099-01-07T10:00:00.000Z",
        pairingType: "SWISS",
        gameMode: "ONE_VS_ONE",
        maxPlayers: 8,
      }),
    });
    const overdueEventId = overdueEventResponse.data.id;
    const overdueEvent = store.events.find((item) => String(item._id) === String(overdueEventId));
    overdueEvent.dateTime = "2000-01-01T10:00:00.000Z";
    overdueEvent.status = "SCHEDULED";

    const overdueUpdate = await request(baseUrl, `/api/events/${overdueEventId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: organizer.cookie },
      body: JSON.stringify({
        description: "Tentativa de atualizar evento vencido",
      }),
    });
    assert.equal(overdueUpdate.response.status, 403);

    const overdueStart = await request(baseUrl, `/api/events/${overdueEventId}/start`, {
      method: "PATCH",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(overdueStart.response.status, 409);
    assert.equal(overdueStart.data.error.message, "Evento cancelado nao pode ser iniciado");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
