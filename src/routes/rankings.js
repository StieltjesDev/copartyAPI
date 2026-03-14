import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.js";
import { getDeckRankings, getPlayerRankings } from "../controllers/rankingsController.js";

const router = Router();

router.get("/players", authenticateToken, getPlayerRankings);
router.get("/decks", authenticateToken, getDeckRankings);

export default router;
