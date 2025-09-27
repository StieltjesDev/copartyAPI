import { Router } from 'express';
import { getUsers, createUser, deleteUser, loginUser } from '../controllers/usersController.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth.js';

const router = Router();

router.get('/', getUsers);
router.post('/', createUser);
router.post('/login', loginUser);
router.delete("/:id", authenticateToken, authorizeAdmin, deleteUser);

export default router;
