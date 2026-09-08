import { Router } from 'express';
import { 
  getTickets, 
  updateTicketTriage,
  createTicket,
  updateTicketDetails,
  archiveTicket,
  restoreTicket,
  updateTicketStatus,
  exportTicketsCsv,
  bulkCloseTickets,
  bulkReassignTickets,
  getTicketTimeline
} from '../controllers/tickets';
import { addCollaborator, removeCollaborator } from '../controllers/collaborators';
import { authenticateToken } from '../middleware/auth';

import repliesRoutes from './replies';

const router = Router();

// All ticket routes require authentication
router.use(authenticateToken);

// --- Goal 7 Routes (Must be before /:id) ---
router.get('/export', exportTicketsCsv);
router.post('/bulk/close', bulkCloseTickets);
router.post('/bulk/reassign', bulkReassignTickets);

// --- Goal 1 Routes ---
router.get('/', getTickets);
router.patch('/:id/triage', updateTicketTriage);

// --- Goal 2 Routes ---
router.post('/', createTicket);
router.put('/:id', updateTicketDetails);
router.patch('/:id/archive', archiveTicket);
router.patch('/:id/restore', restoreTicket);

// --- Goal 3 Routes ---
router.use('/:id/replies', repliesRoutes);

// --- Goal 4 & 5 Audit Timeline ---
router.get('/:id/timeline', getTicketTimeline);

// --- Goal 4 Routes ---
// Status transitions — must come AFTER /archive and /restore to avoid route conflicts
router.patch('/:id/status', updateTicketStatus);

// --- Goal 5 Routes ---
router.post('/:id/collaborators', addCollaborator);
router.delete('/:id/collaborators/:userId', removeCollaborator);

export default router;
