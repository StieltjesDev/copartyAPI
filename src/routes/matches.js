import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.js";
import {
  getMatch,
  getMatchesByEvent,
  patchMatchReopen,
  patchMatchResult,
  patchMatchStatus,
  postMatch,
} from "../controllers/matchesController.js";

const router = Router();

router.post("/", authenticateToken, postMatch);
router.get("/event/:eventId", authenticateToken, getMatchesByEvent);
router.get("/:id", authenticateToken, getMatch);
router.patch("/:id/result", authenticateToken, patchMatchResult);
router.patch("/:id/reopen", authenticateToken, patchMatchReopen);
router.patch("/:id/status", authenticateToken, patchMatchStatus);

export default router;
