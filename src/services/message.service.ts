import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import { CreateMessageInput } from '../validators/message.schema';

export async function createMessage(input: CreateMessageInput, authenticatedTenantId: string) {
  if (input.tenantId !== authenticatedTenantId) {
    throw new AppError(403, 'FORBIDDEN_TENANT_ACCESS', 'Request body tenantId does not match authenticated x-tenant-id');
  }

  const messageId = `msg_${crypto.randomUUID()}`;

  return prisma.$transaction(async (tx) => {
    await tx.tenant.upsert({
      where: { id: input.tenantId },
      update: {},
      create: { id: input.tenantId, name: input.tenantId },
    });

    const existingConversation = await tx.conversation.findUnique({
      where: { id: input.conversationId },
    });

    if (existingConversation) {
      if (existingConversation.tenantId !== input.tenantId) {
        throw new AppError(403, 'CROSS_TENANT_CONVERSATION', 'Conversation belongs to another tenant');
      }
    } else {
      await tx.conversation.create({
        data: {
          id: input.conversationId,
          tenantId: input.tenantId,
        },
      });
    }

    return tx.message.create({
      data: {
        id: messageId,
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        to: input.to,
        text: input.text,
        status: 'QUEUED',
      },
    });
  });
}

export async function getMessageById(messageId: string, authenticatedTenantId: string) {
  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      tenantId: authenticatedTenantId,
    },
  });

  if (!message) {
    throw new AppError(404, 'MESSAGE_NOT_FOUND', `Message with ID '${messageId}' not found`);
  }

  return message;
}
