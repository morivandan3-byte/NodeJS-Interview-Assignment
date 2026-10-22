import { z } from 'zod';

export const createMessageSchema = z.object({
  tenantId: z
    .string({ required_error: 'tenantId is required' })
    .trim()
    .min(1, 'tenantId cannot be empty')
    .max(64, 'tenantId must be 64 characters or fewer'),
  conversationId: z
    .string({ required_error: 'conversationId is required' })
    .trim()
    .min(1, 'conversationId cannot be empty')
    .max(64, 'conversationId must be 64 characters or fewer'),
  to: z
    .string({ required_error: 'to is required' })
    .trim()
    .min(1, 'to cannot be empty')
    .max(32, 'to must be 32 characters or fewer'),
  text: z
    .string({ required_error: 'text is required' })
    .trim()
    .min(1, 'text cannot be empty')
    .max(4096, 'text must be 4096 characters or fewer'),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const conversationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1, 'limit must be at least 1').max(100, 'limit cannot exceed 100').default(20),
  cursor: z.string().trim().optional(),
});

export type ConversationQueryInput = z.infer<typeof conversationQuerySchema>;
