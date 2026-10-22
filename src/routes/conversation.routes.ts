import { Router } from 'express';
import { handleGetConversationMessages } from '../controllers/conversation.controller';
import { tenantMiddleware } from '../middleware/tenant.middleware';

const router = Router();

router.get('/:conversationId/messages', tenantMiddleware, handleGetConversationMessages);

export default router;
