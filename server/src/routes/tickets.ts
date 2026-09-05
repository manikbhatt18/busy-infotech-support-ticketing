import { Router } from 'express';
import { getTickets, updateTicket } from '../controllers/tickets';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All ticket routes require authentication
router.use(authenticateToken);

router.get('/', getTickets);
router.patch('/:id', updateTicket);

export default router;
