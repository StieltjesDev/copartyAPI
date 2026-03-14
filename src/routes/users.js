import { Router } from "express";
import {
  checkAuth,
  createUser,
  deleteUser,
  findUserById,
  getUsers,
  loginUser,
  logoutUser,
} from "../controllers/usersController.js";
import { authenticateToken, authorizeAdmin } from "../middlewares/auth.js";

const router = Router();

router.post("/", createUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.get("/check-auth", authenticateToken, checkAuth);
router.get("/", authenticateToken, authorizeAdmin, getUsers);
router.get("/:id", authenticateToken, findUserById);
router.delete("/:id", authenticateToken, deleteUser);

export default router;
