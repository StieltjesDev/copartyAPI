import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import { getEvents, findEventsByUserId, postEnterEvent, createEvent, getEventById, deleteEvent, postLeaveEvent } from '../controllers/eventsController.js';

const router = Router();

router.get('/', authenticateToken, getEvents );
router.post('/', authenticateToken, createEvent );

router.get('/:id', authenticateToken, getEventById);
router.post('/:id', authenticateToken, postEnterEvent);
router.delete("/:id", authenticateToken, deleteEvent);

router.get("/user/:id", authenticateToken, findEventsByUserId);
router.delete("/user/:id", authenticateToken, postLeaveEvent);

router.post("start/:id", authenticateToken, postStartEvent);

export default router;
