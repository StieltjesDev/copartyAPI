import { Router } from 'express';
import { getUsers, createUser, deleteUser, loginUser, findUserById, checkAuth } from '../controllers/usersController.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth.js';

const router = Router();

router.get('/', authenticateToken, authorizeAdmin, getUsers );
router.post('/', createUser);
router.post('/login', loginUser);
router.get('/check-auth', authenticateToken, checkAuth);
router.delete("/:id", authenticateToken, authorizeAdmin, deleteUser);
router.get("/:id", authenticateToken, authorizeAdmin, findUserById);

export default router;
