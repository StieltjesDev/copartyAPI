import { Router } from 'express';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth.js';
import { createDeck, getDecks, findDecksByUserId, putDeck, deleteDeck, getDeckById } from '../controllers/decksController.js';

const router = Router();

// Admin
router.get('/', authenticateToken, authorizeAdmin, getDecks);
router.post('/user/:id', authenticateToken, authorizeAdmin, createDeck);
router.get("/user/:id", authenticateToken, authorizeAdmin, findDecksByUserId);

// User
router.put("/:id", authenticateToken, putDeck);
router.get("/:id", authenticateToken, getDeckById);
router.delete("/:id", authenticateToken, deleteDeck);
router.get("/user", authenticateToken, findDecksByUserId);
router.post("/user", authenticateToken, createDeck);

export default router;
