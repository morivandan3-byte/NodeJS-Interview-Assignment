import { z } from 'zod';
import { MessageStatus } from '@prisma/client';

export const webhookPayloadSchema = z.object({
  eventId: z
    .string({ required_error: 'eventId is required' })
    .trim()
    .min(1, 'eventId cannot be empty')
    .max(128, 'eventId must be 128 characters or fewer'),
  messageId: z
    .string({ required_error: 'messageId is required' })
    .trim()
    .min(1, 'messageId cannot be empty')
    .max(128, 'messageId must be 128 characters or fewer'),
  status: z.nativeEnum(MessageStatus, {
    errorMap: () => ({ message: 'status must be one of: SENT, DELIVERED, READ, FAILED' }),
  }),
  occurredAt: z
    .string({ required_error: 'occurredAt is required' })
    .datetime({ message: 'occurredAt must be a valid ISO 8601 timestamp string' }),
});

export type WebhookPayloadInput = z.infer<typeof webhookPayloadSchema>;
