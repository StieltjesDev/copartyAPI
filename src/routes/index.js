import { Router } from 'express';
import users from './users.js';
import decks from './deck.js';

const router = Router();
router.use('/decks', decks);
router.use('/users', users);

export default router;
