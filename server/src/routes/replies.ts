import { Router } from 'express';
import { getReplies, createReply } from '../controllers/replies';
import { authenticateToken } from '../middleware/auth';

const router = Router({ mergeParams: true });

router.get('/', authenticateToken, getReplies);
router.post('/', authenticateToken, createReply);

export default router;
