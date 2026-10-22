import { Router } from 'express';
import { handleCreateMessage, handleGetMessage } from '../controllers/message.controller';
import { tenantMiddleware } from '../middleware/tenant.middleware';

const router = Router();

router.post('/', tenantMiddleware, handleCreateMessage);
router.get('/:messageId', tenantMiddleware, handleGetMessage);

export default router;
