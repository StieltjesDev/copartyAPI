import { Router } from "express";
import {
  createPlayer,
  getMyPlayer,
  getPlayerById,
  getPlayers,
  updatePlayer,
} from "../controllers/playersController.js";
import { authenticateToken, authorizeAdmin } from "../middlewares/auth.js";

const router = Router();

router.get("/", authenticateToken, authorizeAdmin, getPlayers);
router.get("/me", authenticateToken, getMyPlayer);
router.post("/", authenticateToken, createPlayer);
router.post("/user/:userId", authenticateToken, authorizeAdmin, createPlayer);
router.get("/:id", authenticateToken, getPlayerById);
router.put("/:id", authenticateToken, updatePlayer);

export default router;
