import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", "src", ".env") });

function getArgValue(flag) {
  const match = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return match ? match.slice(flag.length + 1) : null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function main() {
  const suffix = getArgValue("--suffix");
  const dryRun = hasFlag("--dry-run");

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI nao configurado");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const userFilter = suffix ? { username: new RegExp(`^champ_${suffix}_`) } : { username: /^champ_/ };
  const eventFilter = suffix ? { name: `Championship ${suffix}` } : { name: /^Championship / };

  const users = await User.find(userFilter).select("_id username").lean();
  const userIds = users.map((user) => user._id);
  const players = await Player.find({ userId: { $in: userIds } }).select("_id").lean();
  const playerIds = players.map((player) => player._id);
  const decks = await Deck.find({ playerId: { $in: playerIds } }).select("_id").lean();
  const deckIds = decks.map((deck) => deck._id);
  const events = await Event.find(eventFilter).select("_id name").lean();
  const eventIds = events.map((event) => event._id);
  const eventEntries = await EventEntry.find({ eventId: { $in: eventIds } }).select("_id").lean();
  const eventEntryIds = eventEntries.map((entry) => entry._id);
  const matches = await Match.find({ eventId: { $in: eventIds } }).select("_id").lean();
  const matchIds = matches.map((match) => match._id);

  const summary = {
    users: users.length,
    players: players.length,
    decks: decks.length,
    events: events.length,
    eventEntries: eventEntries.length,
    matches: matches.length,
    matchParticipants: await MatchParticipant.countDocuments({ matchId: { $in: matchIds } }),
    ratings: await Rating.countDocuments({ $or: [{ playerId: { $in: playerIds } }, { deckId: { $in: deckIds } }] }),
    ratingHistory: await RatingHistory.countDocuments({
      $or: [{ matchId: { $in: matchIds } }, { playerId: { $in: playerIds } }, { deckId: { $in: deckIds } }],
    }),
    auditLogs: await AuditLog.countDocuments({
      $or: [
        { actorUserId: { $in: userIds } },
        { entityType: "Event", entityId: { $in: eventIds.map(String) } },
        { entityType: "Match", entityId: { $in: matchIds.map(String) } },
      ],
    }),
  };

  console.log(`Limpeza ${dryRun ? "simulada" : "real"} de campeonatos de teste`);
  console.log(`Filtro users: ${suffix ? `champ_${suffix}_*` : "champ_*"}`);
  console.log(`Filtro events: ${suffix ? `Championship ${suffix}` : "Championship *"}`);
  console.table(summary);

  if (dryRun) {
    await mongoose.disconnect();
    return;
  }

  await MatchParticipant.deleteMany({ matchId: { $in: matchIds } });
  await RatingHistory.deleteMany({
    $or: [{ matchId: { $in: matchIds } }, { playerId: { $in: playerIds } }, { deckId: { $in: deckIds } }],
  });
  await Rating.deleteMany({ $or: [{ playerId: { $in: playerIds } }, { deckId: { $in: deckIds } }] });
  await EventEntry.deleteMany({
    $or: [{ _id: { $in: eventEntryIds } }, { eventId: { $in: eventIds } }, { playerId: { $in: playerIds } }],
  });
  await Match.deleteMany({ _id: { $in: matchIds } });
  await Event.deleteMany({ _id: { $in: eventIds } });
  await AuditLog.deleteMany({
    $or: [
      { actorUserId: { $in: userIds } },
      { entityType: "Event", entityId: { $in: eventIds.map(String) } },
      { entityType: "Match", entityId: { $in: matchIds.map(String) } },
    ],
  });

  for (const user of users) {
    await User.findOneAndDelete({ _id: user._id });
  }

  console.log("Dados de teste removidos com sucesso.");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message || error);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exitCode = 1;
});
