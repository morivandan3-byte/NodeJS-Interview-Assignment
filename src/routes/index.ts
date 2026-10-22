import { Router } from 'express';
import messageRoutes from './message.routes';
import conversationRoutes from './conversation.routes';
import webhookRoutes from './webhook.routes';

const router = Router();

router.use('/messages', messageRoutes);
router.use('/conversations', conversationRoutes);
router.use('/webhooks', webhookRoutes);

export default router;
