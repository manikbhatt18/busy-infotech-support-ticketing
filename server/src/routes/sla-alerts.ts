import { Router } from 'express';
import { getSlaAlerts, getSlaAlertCount, acknowledgeSlaAlert } from '../controllers/sla-alerts';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// --- Goal 10 Routes ---
// Count must come before /:ticketId to avoid route conflicts
router.get('/count', getSlaAlertCount);
router.get('/', getSlaAlerts);
router.post('/:ticketId/acknowledge', acknowledgeSlaAlert);

export default router;
