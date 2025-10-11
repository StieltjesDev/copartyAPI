import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import { getEvents, findEventsByUserId, postEnterEvent, createEvent, getEventById, deleteEvent, deleteLeaveEvent, putEvent } from '../controllers/eventsController.js';

const router = Router();

router.get('/', authenticateToken, getEvents );
router.post('/', authenticateToken, createEvent );

router.get('/:id', authenticateToken, getEventById);
router.post('/:id', authenticateToken, postEnterEvent);
router.put('/:id', authenticateToken, putEvent);
router.delete("/:id", authenticateToken, deleteEvent);

router.get("/user/:id", authenticateToken, findEventsByUserId);
router.delete(":idEvent/user/:idUser", authenticateToken, deleteLeaveEvent);

//router.post("start/:id", authenticateToken, postStartEvent);

export default router;
