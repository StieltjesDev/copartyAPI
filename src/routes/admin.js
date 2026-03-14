import { Router } from "express";
import {
  rebuildCompetitiveData,
  rebuildCompetitiveDataByEvent,
  rebuildCompetitiveDataByMatch,
  rebuildCompetitiveDataByRound,
} from "../controllers/adminController.js";
import { authenticateToken, authorizeAdmin } from "../middlewares/auth.js";

const router = Router();

router.post("/rebuild", authenticateToken, authorizeAdmin, rebuildCompetitiveData);
router.post("/rebuild/event/:eventId", authenticateToken, authorizeAdmin, rebuildCompetitiveDataByEvent);
router.post("/rebuild/round/:eventId/:round", authenticateToken, authorizeAdmin, rebuildCompetitiveDataByRound);
router.post("/rebuild/match/:matchId", authenticateToken, authorizeAdmin, rebuildCompetitiveDataByMatch);

export default router;
