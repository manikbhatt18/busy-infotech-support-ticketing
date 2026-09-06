import { Router } from 'express';
import { getAnalytics } from '../controllers/analytics';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// --- Goal 8 Routes ---
router.get('/', getAnalytics);

export default router;
