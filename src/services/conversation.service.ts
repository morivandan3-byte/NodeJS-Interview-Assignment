import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';

export interface PaginatedMessagesResponse {
  data: Array<{
    id: string;
    tenantId: string;
    conversationId: string;
    to: string;
    text: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    lastEventOccurredAt: Date | null;
    sentAt: Date | null;
    deliveredAt: Date | null;
    readAt: Date | null;
    failedAt: Date | null;
  }>;
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export async function getConversationMessages(
  conversationId: string,
  authenticatedTenantId: string,
  limit: number,
  cursor?: string
): Promise<PaginatedMessagesResponse> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (conversation && conversation.tenantId !== authenticatedTenantId) {
    throw new AppError(404, 'CONVERSATION_NOT_FOUND', `Conversation '${conversationId}' not found`);
  }

  let cursorFilter = {};

  if (cursor) {
    const cursorMessage = await prisma.message.findFirst({
      where: {
        id: cursor,
        conversationId,
        tenantId: authenticatedTenantId,
      },
    });

    if (!cursorMessage) {
      throw new AppError(400, 'INVALID_CURSOR', 'Cursor is invalid or does not exist in this conversation');
    }

    cursorFilter = {
      OR: [
        {
          createdAt: {
            gt: cursorMessage.createdAt,
          },
        },
        {
          createdAt: cursorMessage.createdAt,
          id: {
            gt: cursorMessage.id,
          },
        },
      ],
    };
  }

  const messages = await prisma.message.findMany({
    where: {
      tenantId: authenticatedTenantId,
      conversationId,
      ...cursorFilter,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
  });

  const hasMore = messages.length > limit;
  const data = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

  return {
    data,
    pagination: {
      limit,
      nextCursor,
      hasMore,
    },
  };
}
