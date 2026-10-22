import { Request, Response, NextFunction } from 'express';
import { webhookPayloadSchema } from '../validators/webhook.schema';
import * as webhookService from '../services/webhook.service';

export async function handleProviderWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validatedData = webhookPayloadSchema.parse(req.body);
    const result = await webhookService.processWebhookEvent(validatedData);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
