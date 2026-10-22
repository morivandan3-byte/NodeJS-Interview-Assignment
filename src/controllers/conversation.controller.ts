import { Response, NextFunction } from 'express';
import { AuthenticatedTenantRequest } from '../middleware/tenant.middleware';
import { conversationQuerySchema } from '../validators/message.schema';
import * as conversationService from '../services/conversation.service';

export async function handleGetConversationMessages(
  req: AuthenticatedTenantRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { conversationId } = req.params;
    const { limit, cursor } = conversationQuerySchema.parse(req.query);

    const result = await conversationService.getConversationMessages(
      conversationId,
      req.tenantId!,
      limit,
      cursor
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
