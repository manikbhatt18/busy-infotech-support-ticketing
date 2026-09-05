import { Router } from 'express';
import { 
  getTickets, 
  updateTicketTriage,
  createTicket,
  updateTicketDetails,
  archiveTicket,
  restoreTicket
} from '../controllers/tickets';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All ticket routes require authentication
router.use(authenticateToken);

// --- Goal 1 Routes ---
router.get('/', getTickets);
router.patch('/:id/triage', updateTicketTriage);

// --- Goal 2 Routes ---
router.post('/', createTicket);
router.put('/:id', updateTicketDetails);
router.patch('/:id/archive', archiveTicket);
router.patch('/:id/restore', restoreTicket);

export default router;
