import { Router } from 'express';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth.js';
import { createDeck, getDecks } from '../controllers/decksController.js';

const router = Router();

router.get('/', authenticateToken, authorizeAdmin, getDecks);
router.post('/user', authenticateToken, createDeck);
router.delete("/user/:id", authenticateToken);
router.patch("/user/:id", authenticateToken);
router.get("/user/:id", authenticateToken);
router.get("user", authenticateToken);


export default router;
