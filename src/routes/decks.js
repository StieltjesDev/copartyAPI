import { Router } from "express";
import { authenticateToken, authorizeAdmin } from "../middlewares/auth.js";
import {
  createDeck,
  deleteDeck,
  findDecksByPlayerId,
  getDeckById,
  getDecks,
  putDeck,
} from "../controllers/decksController.js";

const router = Router();

router.get("/", authenticateToken, authorizeAdmin, getDecks);
router.get("/me", authenticateToken, findDecksByPlayerId);
router.post("/me", authenticateToken, createDeck);
router.get("/player/:playerId", authenticateToken, authorizeAdmin, findDecksByPlayerId);
router.post("/player/:playerId", authenticateToken, authorizeAdmin, createDeck);
router.get("/:id", authenticateToken, getDeckById);
router.put("/:id", authenticateToken, putDeck);
router.delete("/:id", authenticateToken, deleteDeck);

export default router;
