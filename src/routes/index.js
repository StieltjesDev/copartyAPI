import { Router } from 'express';
import users from './users.js';
import decks from './decks.js';
import events from './events.js';

const router = Router();
router.use('/decks', decks);
router.use('/users', users);
router.use('/events', events);

export default router;
