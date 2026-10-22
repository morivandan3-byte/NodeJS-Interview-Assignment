import { Router } from 'express';
import { handleProviderWebhook } from '../controllers/webhook.controller';

const router = Router();

router.post('/provider', handleProviderWebhook);

export default router;
