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

function isSupportedDeckLink(link) {
  if (!link) return true;

  try {
    const url = new URL(link);
    if (["moxfield.com", "www.moxfield.com"].includes(url.hostname)) {
      return url.pathname.startsWith("/decks/");
    }

    if (["ligamagic.com.br", "www.ligamagic.com.br"].includes(url.hostname)) {
      return url.searchParams.get("view") === "dks/deck" && url.searchParams.has("id");
    }

    return false;
  } catch {
    return false;
  }
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
    if (this.isNew && !this.email) {
      const error = new Error("validation failed");
      error.name = "ValidationError";
      error.errors = {
        email: { message: "Email e obrigatorio" },
      };
      throw error;
    }
    this._id ||= makeId("user", counter);
    if (this._plainPassword) {
      this.passwordHash = `hashed:${this._plainPassword}`;
    }
    this.createdAt ||= new Date().toISOString();

    const duplicateUsername = store.users.find(
      (item) => String(item._id) !== String(this._id) && item.username === this.username
    );
    if (duplicateUsername) {
      const error = new Error("duplicate username");
      error.code = 11000;
      error.keyPattern = { username: 1 };
      throw error;
    }

    if (this.email) {
      const duplicateEmail = store.users.find(
        (item) => String(item._id) !== String(this._id) && item.email === this.email
      );
      if (duplicateEmail) {
        const error = new Error("duplicate email");
        error.code = 11000;
        error.keyPattern = { email: 1 };
        throw error;
      }
    }

    const plain = {
      _id: this._id,
      username: this.username,
      email: this.email ?? null,
      role: this.role ?? "user",
      passwordHash: this.passwordHash,
      createdAt: this.createdAt,
    };

    const index = store.users.findIndex((item) => String(item._id) === String(this._id));
    if (index >= 0) {
      store.users[index] = plain;
    } else {
      store.users.push(plain);
    }

    return this;
  };
  User.prototype.comparePassword = async function comparePassword(password) {
    return this.passwordHash === `hashed:${password}`;
  };
  User.find = () => query(store.users);
  User.findById = (id) => {
    const user = store.users.find((item) => String(item._id) === String(id)) ?? null;
    return query(user ? attachSave({
      ...user,
      comparePassword: async (password) => user.passwordHash === `hashed:${password}`,
    }, "users", store) : null);
  };
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
    const plain = {
      _id: this._id,
      userId: this.userId,
      displayName: this.displayName,
      points: this.points ?? 0,
      wins: this.wins ?? 0,
      losses: this.losses ?? 0,
      draws: this.draws ?? 0,
      createdAt: this.createdAt,
    };

    const index = store.players.findIndex((item) => String(item._id) === String(this._id));
    if (index >= 0) {
      store.players[index] = plain;
    } else {
      store.players.push(plain);
    }

    return this;
  };
  Player.find = () => query(store.players);
  Player.findOne = (filter) => {
    const player = store.players.find((item) => matchesFilter(item, filter)) ?? null;
    return query(player ? attachSave({ ...player }, "players", store) : null);
  };
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
    if (!isSupportedDeckLink(this.link)) {
      const error = new Error("validation failed");
      error.name = "ValidationError";
      error.errors = {
        link: { message: "Link precisa ser um deck da LigaMagic ou do Moxfield" },
      };
      throw error;
    }

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
      format: this.format ?? "CUSTOM",
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
  EventEntry.findOneAndUpdate = async (filter, update) => {
    const entry = store.entries.find((item) => matchesFilter(item, filter));
    if (!entry) return null;
    Object.assign(entry, update);
    return { ...entry };
  };
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



  const deck = await request(baseUrl, "/api/decks/me", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: deckName,
      format,
      commander,
      link: `https://moxfield.com/decks/${username}-deck`,
    }),
  });

  const player = await request(baseUrl, "/api/players/me", { headers: { cookie } });

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

    const playerResponse = await request(baseUrl, "/api/players/me", {
      headers: { cookie },
    });
    assert.equal(playerResponse.response.status, 200);
    assert.equal(playerResponse.data.displayName, "organizer");

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
        link: "https://moxfield.com/decks/deck-a",
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



    const deck2 = await request(baseUrl, "/api/decks/me", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie2 },
      body: JSON.stringify({
        name: "Deck B",
        format: "MODERN",
        commander: null,
        link: "https://moxfield.com/decks/deck-b",
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

    const start = await request(baseUrl, `/api/events/${eventId}/start`, {
      method: "PATCH",
      headers: { cookie },
    });
    assert.equal(start.response.status, 200);

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
    const commanderWinner = result.data.participants.find((participant) => participant.resultType === "WIN");
    const commanderLosers = result.data.participants.filter((participant) => participant.resultType === "LOSS");
    assert.equal(commanderWinner.pointsEarned, 3);
    assert.equal(commanderWinner.score, 2);
    assert.equal(commanderWinner.eliminations, 0);
    assert.ok(commanderLosers.every((participant) => participant.pointsEarned === 0));
    assert.ok(commanderLosers.every((participant) => participant.score === 0));
    assert.ok(commanderLosers.every((participant) => participant.eliminations === 0));
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
    assert.equal(typeof standings.data[0].buchholz, "number");
    assert.equal(typeof standings.data[0].opponentMatchWinRate, "number");
    assert.equal(standings.data[0].position, 1);

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



      const deck = await request(baseUrl, "/api/decks/me", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          name: `Commander Deck ${index}`,
          format: "COMMANDER",
          commander: `Commander Card ${index}`,
          link: `https://moxfield.com/decks/commander-${index}`,
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

    const start = await request(baseUrl, `/api/events/${eventId}/start`, {
      method: "PATCH",
      headers: { cookie: cookies[0] },
    });
    assert.equal(start.response.status, 200);

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
          placement: index === 0 ? 1 : 2,
          score: index === 0 ? 99 : 77,
          pointsEarned: index === 0 ? 99 : 77,
          isWinner: index === 0,
          eliminations: index === 0 ? 3 : 1,
        })),
      }),
    });
    assert.equal(result.response.status, 200);
    const commanderWinner = result.data.participants.find((participant) => participant.resultType === "WIN");
    const commanderLosers = result.data.participants.filter((participant) => participant.resultType === "LOSS");
    assert.equal(commanderWinner.pointsEarned, 3);
    assert.equal(commanderWinner.score, 2);
    assert.equal(commanderWinner.eliminations, 0);
    assert.ok(commanderLosers.every((participant) => participant.pointsEarned === 0));
    assert.ok(commanderLosers.every((participant) => participant.score === 0));
    assert.ok(commanderLosers.every((participant) => participant.eliminations === 0));
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
    assert.equal(standings.data[0].points, 3);

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

    const start = await request(baseUrl, `/api/events/${eventId}/start`, {
      method: "PATCH",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(start.response.status, 200);

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
            score: 99,
            pointsEarned: 99,
            isWinner: true,
            eliminations: 4,
          },
          {
            eventEntryId: store.entries[1]._id,
            resultType: "LOSS",
            placement: 2,
            score: 77,
            pointsEarned: 77,
            isWinner: false,
            eliminations: 8,
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
            score: 99,
            pointsEarned: 99,
            isWinner: true,
            eliminations: 4,
          },
          {
            eventEntryId: store.entries[1]._id,
            resultType: "LOSS",
            placement: 2,
            score: 77,
            pointsEarned: 77,
            isWinner: false,
            eliminations: 8,
          },
        ],
      }),
    });
    assert.equal(validResult.response.status, 200);
    const winningParticipant = validResult.data.participants.find((participant) => String(participant.eventEntryId._id || participant.eventEntryId) === String(store.entries[0]._id));
    const losingParticipant = validResult.data.participants.find((participant) => String(participant.eventEntryId._id || participant.eventEntryId) === String(store.entries[1]._id));
    assert.equal(winningParticipant.pointsEarned, 3);
    assert.equal(winningParticipant.score, 2);
    assert.equal(winningParticipant.eliminations, 0);
    assert.equal(losingParticipant.pointsEarned, 0);
    assert.equal(losingParticipant.score, 0);
    assert.equal(losingParticipant.eliminations, 0);
    const duplicateResult = await request(baseUrl, `/api/matches/${matchId}/result`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: organizer.cookie },
      body: JSON.stringify({
        participants: [
          {
            eventEntryId: store.entries[0]._id,
            resultType: "WIN",
            placement: 1,
            score: 99,
            pointsEarned: 99,
            isWinner: true,
            eliminations: 4,
          },
          {
            eventEntryId: store.entries[1]._id,
            resultType: "LOSS",
            placement: 2,
            score: 77,
            pointsEarned: 77,
            isWinner: false,
            eliminations: 8,
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
        pairingType: "ROUND_ROBIN",
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
    assert.equal(finish.data.event.status, "FINISHED");

    const completedUpdate = await request(baseUrl, `/api/events/${eventId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: organizer.cookie },
      body: JSON.stringify({
        description: "Tentativa de editar evento completo",
      }),
    });
    assert.equal(completedUpdate.response.status, 403);

    const joinFinished = await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: organizer.cookie },
      body: JSON.stringify({ deckId: organizer.deck._id }),
    });
    assert.equal(joinFinished.response.status, 400);

    const generateFinished = await request(baseUrl, `/api/events/${eventId}/rounds/2/generate`, {
      method: "POST",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(generateFinished.response.status, 409);

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
        pairingType: "ROUND_ROBIN",
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
        pairingType: "ROUND_ROBIN",
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

test("evento aplica formato oficial e bloqueia deck incompativel na inscricao", async () => {
  setupInMemoryPersistence();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const organizer = await createUserAndSession(baseUrl, {
      username: "format-organizer",
      email: "format-organizer@test.com",
      role: "admin",
      displayName: "Format Organizer",
      deckName: "Commander Table",
      format: "COMMANDER",
      commander: "Atraxa",
    });

    const challenger = await createUserAndSession(baseUrl, {
      username: "format-player",
      email: "format-player@test.com",
      role: "user",
      displayName: "Format Player",
      deckName: "Pioneer Deck",
      format: "PIONEER",
    });

    const deckResponse = await request(baseUrl, "/api/decks/me", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: challenger.cookie },
      body: JSON.stringify({
        name: "Commander Legal Deck",
        format: "COMMANDER",
        commander: "Kinnan",
        link: "https://moxfield.com/decks/format-player-commander",
      }),
    });
    assert.equal(deckResponse.response.status, 201);

    const eventResponse = await request(baseUrl, "/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: organizer.cookie,
      },
      body: JSON.stringify({
        name: "Commander League",
        description: "Evento com formato travado",
        dateTime: "2099-03-01T10:00:00.000Z",
        format: "COMMANDER",
        pairingType: "ROUND_ROBIN",
        gameMode: "ONE_VS_ONE",
        maxPlayers: 16,
      }),
    });
    assert.equal(eventResponse.response.status, 201);
    const eventId = eventResponse.data.id;

    const event = await request(baseUrl, `/api/events/${eventId}`, {
      headers: { cookie: organizer.cookie },
    });
    assert.equal(event.response.status, 200);
    assert.equal(event.data.format, "COMMANDER");
    assert.equal(event.data.gameMode, "COMMANDER_MULTIPLAYER");
    assert.equal(event.data.pairingType, "SWISS");

    const incompatibleJoin = await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: challenger.cookie },
      body: JSON.stringify({ deckId: challenger.deck._id }),
    });
    assert.equal(incompatibleJoin.response.status, 400);
    assert.equal(incompatibleJoin.data.error.message, "Deck incompativel com o formato do evento");

    const compatibleJoin = await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: challenger.cookie },
      body: JSON.stringify({ deckId: deckResponse.data._id }),
    });
    assert.equal(compatibleJoin.response.status, 201);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("drop remove inscrito dos proximos pareamentos e mantem standings", async () => {
  setupInMemoryPersistence();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const organizer = await createUserAndSession(baseUrl, {
      username: "drop-organizer",
      email: "drop-organizer@test.com",
      role: "admin",
      displayName: "Drop Organizer",
      deckName: "Drop Deck A",
    });
    const playerTwo = await createUserAndSession(baseUrl, {
      username: "drop-player-two",
      email: "drop-player-two@test.com",
      role: "user",
      displayName: "Drop Player Two",
      deckName: "Drop Deck B",
    });
    const playerThree = await createUserAndSession(baseUrl, {
      username: "drop-player-three",
      email: "drop-player-three@test.com",
      role: "user",
      displayName: "Drop Player Three",
      deckName: "Drop Deck C",
    });
    const playerFour = await createUserAndSession(baseUrl, {
      username: "drop-player-four",
      email: "drop-player-four@test.com",
      role: "user",
      displayName: "Drop Player Four",
      deckName: "Drop Deck D",
    });

    const eventResponse = await request(baseUrl, "/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: organizer.cookie,
      },
      body: JSON.stringify({
        name: "Drop Cup",
        description: "Evento para testar drop",
        dateTime: "2099-04-01T10:00:00.000Z",
        format: "MODERN",
        pairingType: "ROUND_ROBIN",
        gameMode: "ONE_VS_ONE",
        maxPlayers: 16,
      }),
    });
    assert.equal(eventResponse.response.status, 201);
    const eventId = eventResponse.data.id;

    await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: organizer.cookie },
      body: JSON.stringify({ deckId: organizer.deck._id }),
    });
    await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: playerTwo.cookie },
      body: JSON.stringify({ deckId: playerTwo.deck._id }),
    });
    await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: playerThree.cookie },
      body: JSON.stringify({ deckId: playerThree.deck._id }),
    });
    await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: playerFour.cookie },
      body: JSON.stringify({ deckId: playerFour.deck._id }),
    });

    const start = await request(baseUrl, `/api/events/${eventId}/start`, {
      method: "PATCH",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(start.response.status, 200);

    const roundOne = await request(baseUrl, `/api/events/${eventId}/rounds/1/generate`, {
      method: "POST",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(roundOne.response.status, 201);
    assert.equal(roundOne.data.length, 2);

    const entriesResponse = await request(baseUrl, `/api/events/${eventId}/entries`, {
      headers: { cookie: organizer.cookie },
    });
    const droppedPlayerId = playerFour.player._id || playerFour.player.id;

    for (const match of roundOne.data) {
      const participants = match.participants.map((participant, index) => ({
        eventEntryId: participant.eventEntryId,
        resultType: index === 0 ? "WIN" : "LOSS",
        placement: index + 1,
        score: index === 0 ? 2 : 0,
        pointsEarned: index === 0 ? 3 : 0,
        isWinner: index === 0,
        eliminations: 0,
      }));

      const submitResult = await request(baseUrl, `/api/matches/${match._id}/result`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: organizer.cookie },
        body: JSON.stringify({ participants }),
      });
      assert.equal(submitResult.response.status, 200);

      const completeMatch = await request(baseUrl, `/api/matches/${match._id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: organizer.cookie },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      assert.equal(completeMatch.response.status, 200);
    }

    const closeRound = await request(baseUrl, `/api/events/${eventId}/rounds/1/close`, {
      method: "POST",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(closeRound.response.status, 200);

    const droppedEntry = entriesResponse.data.find((entry) => String(entry.playerId?._id || entry.playerId) === String(droppedPlayerId));
    const drop = await request(baseUrl, `/api/events/${eventId}/entries/${droppedEntry._id}/drop`, {
      method: "PATCH",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(drop.response.status, 200);
    assert.equal(drop.data.entry.status, "DROPPED");

    const roundTwo = await request(baseUrl, `/api/events/${eventId}/rounds/2/generate`, {
      method: "POST",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(roundTwo.response.status, 201);

    const droppedEntryId = String(droppedEntry._id);
    const roundTwoParticipants = roundTwo.data.flatMap((match) => match.participants.map((participant) => String(participant.eventEntryId)));
    assert.equal(roundTwoParticipants.includes(droppedEntryId), false);

    const standings = await request(baseUrl, `/api/events/${eventId}/standings`, {
      headers: { cookie: organizer.cookie },
    });
    assert.equal(standings.response.status, 200);
    assert.equal(standings.data.some((row) => String(row.eventEntryId) === droppedEntryId), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("rejeita link de deck fora da LigaMagic ou Moxfield", async () => {
  setupInMemoryPersistence();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const user = await createUserAndSession(baseUrl, {
      username: "deck-link-user",
      email: "deck-link-user@test.com",
      role: "user",
      displayName: "Deck Link User",
      deckName: "Deck Link Base",
    });

    const invalidDeck = await request(baseUrl, "/api/decks/me", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: user.cookie },
      body: JSON.stringify({
        name: "Deck Invalido",
        format: "MODERN",
        link: "https://deckstats.net/decks/123",
      }),
    });

    assert.equal(invalidDeck.response.status, 400);
    assert.equal(invalidDeck.data.error.message, "Falha de validacao");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("cadastro exige email para novos usuarios", async () => {
  setupInMemoryPersistence();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const signup = await request(baseUrl, "/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "missing-email-user",
        password: "123456",
        role: "user",
      }),
    });

    assert.equal(signup.response.status, 400);
    assert.equal(signup.data.error.message, "Campos obrigatorios ausentes: email");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("perfil permite editar username e email unico e sincroniza displayName do player", async () => {
  const store = setupInMemoryPersistence();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    store.users.push({
      _id: "legacy-profile-user",
      username: "profile-user",
      email: null,
      role: "user",
      passwordHash: "hashed:123456",
      createdAt: new Date().toISOString(),
    });

    const userOne = { data: { id: "legacy-profile-user" } };

    const loginOne = await request(baseUrl, "/api/users/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "profile-user", password: "123456" }),
    });
    const cookieOne = loginOne.response.headers.get("set-cookie");
    assert.ok(cookieOne);

    store.players.push({
      _id: "legacy-player",
      userId: "legacy-profile-user",
      displayName: "profile-user",
      points: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: new Date().toISOString(),
    });


    const userTwo = await request(baseUrl, "/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "taken-user",
        email: "taken@test.com",
        password: "123456",
        role: "user",
      }),
    });
    assert.equal(userTwo.response.status, 201);

    const updateProfile = await request(baseUrl, `/api/users/${userOne.data.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookieOne },
      body: JSON.stringify({
        username: "profile-user-renamed",
        email: "profile@test.com",
      }),
    });
    assert.equal(updateProfile.response.status, 200);
    assert.equal(updateProfile.data.username, "profile-user-renamed");
    assert.equal(updateProfile.data.email, "profile@test.com");

    assert.equal(store.players.find((player) => String(player.userId) === String(userOne.data.id)).displayName, "profile-user-renamed");

    const duplicateEmail = await request(baseUrl, `/api/users/${userOne.data.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookieOne },
      body: JSON.stringify({ email: "taken@test.com" }),
    });
    assert.equal(duplicateEmail.response.status, 400);
    assert.equal(duplicateEmail.data.error.message, "email ja cadastrado!");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});





test("organizador remove inscricao antes do inicio e drop so vale com evento em andamento", async () => {
  setupInMemoryPersistence();

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const organizer = await createUserAndSession(baseUrl, {
      username: "entry-organizer",
      email: "entry-organizer@test.com",
      role: "admin",
      displayName: "Entry Organizer",
      deckName: "Entry Deck A",
    });
    const player = await createUserAndSession(baseUrl, {
      username: "entry-player",
      email: "entry-player@test.com",
      role: "user",
      displayName: "Entry Player",
      deckName: "Entry Deck B",
    });

    const eventResponse = await request(baseUrl, "/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: organizer.cookie,
      },
      body: JSON.stringify({
        name: "Entry Rules Cup",
        description: "Validacao de remocao e drop",
        dateTime: "2099-05-01T10:00:00.000Z",
        pairingType: "SWISS",
        gameMode: "ONE_VS_ONE",
        maxPlayers: 8,
      }),
    });
    assert.equal(eventResponse.response.status, 201);
    const eventId = eventResponse.data.id;

    const firstJoin = await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: player.cookie },
      body: JSON.stringify({ deckId: player.deck._id }),
    });
    assert.equal(firstJoin.response.status, 201);

    const entriesBeforeStart = await request(baseUrl, `/api/events/${eventId}/entries`, {
      headers: { cookie: organizer.cookie },
    });
    const removableEntry = entriesBeforeStart.data.find((entry) => String(entry.playerId?._id || entry.playerId) === String(player.player._id || player.player.id));

    const dropBeforeStart = await request(baseUrl, `/api/events/${eventId}/entries/${removableEntry._id}/drop`, {
      method: "PATCH",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(dropBeforeStart.response.status, 409);

    const removeBeforeStart = await request(baseUrl, `/api/events/${eventId}/entries/${removableEntry._id}`, {
      method: "DELETE",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(removeBeforeStart.response.status, 200);

    const secondJoin = await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: player.cookie },
      body: JSON.stringify({ deckId: player.deck._id }),
    });
    assert.equal(secondJoin.response.status, 201);

    const organizerJoin = await request(baseUrl, `/api/events/${eventId}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: organizer.cookie },
      body: JSON.stringify({ deckId: organizer.deck._id }),
    });
    assert.equal(organizerJoin.response.status, 201);

    const start = await request(baseUrl, `/api/events/${eventId}/start`, {
      method: "PATCH",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(start.response.status, 200);

    const entriesAfterStart = await request(baseUrl, `/api/events/${eventId}/entries`, {
      headers: { cookie: organizer.cookie },
    });
    const droppableEntry = entriesAfterStart.data.find((entry) => String(entry.playerId?._id || entry.playerId) === String(player.player._id || player.player.id));

    const removeAfterStart = await request(baseUrl, `/api/events/${eventId}/entries/${droppableEntry._id}`, {
      method: "DELETE",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(removeAfterStart.response.status, 409);

    const dropAfterStart = await request(baseUrl, `/api/events/${eventId}/entries/${droppableEntry._id}/drop`, {
      method: "PATCH",
      headers: { cookie: organizer.cookie },
    });
    assert.equal(dropAfterStart.response.status, 200);
    assert.equal(dropAfterStart.data.entry.status, "DROPPED");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});



