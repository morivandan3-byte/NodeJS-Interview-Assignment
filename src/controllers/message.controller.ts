import { Response, NextFunction } from 'express';
import { AuthenticatedTenantRequest } from '../middleware/tenant.middleware';
import { createMessageSchema } from '../validators/message.schema';
import * as messageService from '../services/message.service';

export async function handleCreateMessage(
  req: AuthenticatedTenantRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validatedData = createMessageSchema.parse(req.body);
    const message = await messageService.createMessage(validatedData, req.tenantId!);

    res.status(201).json({
      data: message,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleGetMessage(
  req: AuthenticatedTenantRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { messageId } = req.params;
    const message = await messageService.getMessageById(messageId, req.tenantId!);

    res.status(200).json({
      data: message,
    });
  } catch (error) {
    next(error);
  }
}
