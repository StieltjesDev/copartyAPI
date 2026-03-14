import { Router } from "express";
import admin from "./admin.js";
import decks from "./decks.js";
import events from "./events.js";
import matches from "./matches.js";
import players from "./players.js";
import rankings from "./rankings.js";
import users from "./users.js";

const router = Router();

router.use("/admin", admin);
router.use("/decks", decks);
router.use("/events", events);
router.use("/matches", matches);
router.use("/players", players);
router.use("/rankings", rankings);
router.use("/users", users);

export default router;
