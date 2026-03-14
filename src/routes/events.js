import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.js";
import {
  cancelCurrentEvent,
  createEvent,
  deleteEvent,
  deleteLeaveEvent,
  findEventsByUserId,
  finishCurrentEvent,
  generateEventRound,
  getEventById,
  getEventEntries,
  getEvents,
  getEventRound,
  getMatchesForEvent,
  postEnterEvent,
  startCurrentEvent,
  putEvent,
  closeEventRound,
  getStandings,
} from "../controllers/eventsController.js";

const router = Router();

router.get("/", authenticateToken, getEvents);
router.post("/", authenticateToken, createEvent);
router.get("/user/:id", authenticateToken, findEventsByUserId);
router.get("/:eventId/entries", authenticateToken, getEventEntries);
router.get("/:eventId/matches", authenticateToken, getMatchesForEvent);
router.post("/:id/entries", authenticateToken, postEnterEvent);
router.delete("/:id/entries/me", authenticateToken, deleteLeaveEvent);
router.post("/:eventId/rounds/:round/generate", authenticateToken, generateEventRound);
router.get("/:eventId/rounds/:round", authenticateToken, getEventRound);
router.post("/:eventId/rounds/:round/close", authenticateToken, closeEventRound);
router.patch("/:id/start", authenticateToken, startCurrentEvent);
router.patch("/:id/cancel", authenticateToken, cancelCurrentEvent);
router.patch("/:id/finish", authenticateToken, finishCurrentEvent);
router.get("/:eventId/standings", authenticateToken, getStandings);
router.get("/:id", authenticateToken, getEventById);
router.put("/:id", authenticateToken, putEvent);
router.delete("/:id", authenticateToken, deleteEvent);

export default router;
