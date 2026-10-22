import { Prisma, MessageStatus } from '@prisma/client';

export interface MockTenant {
  id: string;
  name?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockConversation {
  id: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockMessage {
  id: string;
  tenantId: string;
  conversationId: string;
  to: string;
  text: string;
  status: MessageStatus;
  createdAt: Date;
  updatedAt: Date;
  lastEventOccurredAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
}

export interface MockWebhookEvent {
  id: string;
  eventId: string;
  messageId: string;
  status: MessageStatus;
  occurredAt: Date;
  processedAt: Date;
}

export function createMockPrismaClient() {
  const tenants = new Map<string, MockTenant>();
  const conversations = new Map<string, MockConversation>();
  const messages = new Map<string, MockMessage>();
  const webhookEvents = new Map<string, MockWebhookEvent>();

  const reset = () => {
    tenants.clear();
    conversations.clear();
    messages.clear();
    webhookEvents.clear();
  };

  const client = {
    _reset: reset,
    $queryRaw: async () => [{ '?column?': 1 }],
    $disconnect: async () => {},

    tenant: {
      upsert: async ({ where, create, update }: any) => {
        let item = tenants.get(where.id);
        if (item) {
          item = { ...item, ...update, updatedAt: new Date() };
        } else {
          item = { ...create, createdAt: new Date(), updatedAt: new Date() };
        }
        tenants.set(where.id, item);
        return item;
      },
      findUnique: async ({ where }: any) => tenants.get(where.id) || null,
    },

    conversation: {
      findUnique: async ({ where }: any) => conversations.get(where.id) || null,
      create: async ({ data }: any) => {
        const item: MockConversation = {
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        conversations.set(data.id, item);
        return item;
      },
    },

    message: {
      findUnique: async ({ where }: any) => messages.get(where.id) || null,
      findFirst: async ({ where }: any) => {
        for (const msg of messages.values()) {
          let match = true;
          if (where.id && msg.id !== where.id) match = false;
          if (where.tenantId && msg.tenantId !== where.tenantId) match = false;
          if (where.conversationId && msg.conversationId !== where.conversationId) match = false;
          if (match) return msg;
        }
        return null;
      },
      findMany: async ({ where, orderBy, take }: any) => {
        let results = Array.from(messages.values()).filter((msg) => {
          if (where.tenantId && msg.tenantId !== where.tenantId) return false;
          if (where.conversationId && msg.conversationId !== where.conversationId) return false;

          if (where.OR) {
            const matchesOr = where.OR.some((condition: any) => {
              if (condition.createdAt?.gt) {
                return msg.createdAt.getTime() > condition.createdAt.gt.getTime();
              }
              if (condition.createdAt && condition.id?.gt) {
                return (
                  msg.createdAt.getTime() === condition.createdAt.getTime() &&
                  msg.id > condition.id.gt
                );
              }
              return false;
            });
            if (!matchesOr) return false;
          }

          return true;
        });

        if (orderBy) {
          results.sort((a, b) => {
            const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
            if (timeDiff !== 0) return timeDiff;
            return a.id.localeCompare(b.id);
          });
        }

        if (take) {
          results = results.slice(0, take);
        }

        return results;
      },
      create: async ({ data }: any) => {
        const now = new Date();
        const item: MockMessage = {
          id: data.id,
          tenantId: data.tenantId,
          conversationId: data.conversationId,
          to: data.to,
          text: data.text,
          status: data.status || 'QUEUED',
          createdAt: now,
          updatedAt: now,
          lastEventOccurredAt: null,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
        };
        messages.set(item.id, item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const msg = messages.get(where.id);
        if (!msg) {
          throw new Prisma.PrismaClientKnownRequestError('Record not found', {
            code: 'P2025',
            clientVersion: '5.22.0',
          });
        }
        const updated = {
          ...msg,
          ...data,
          updatedAt: new Date(),
        };
        messages.set(where.id, updated);
        return updated;
      },
    },

    webhookEvent: {
      findUnique: async ({ where }: any) => {
        for (const evt of webhookEvents.values()) {
          if (evt.eventId === where.eventId) {
            const message = messages.get(evt.messageId) || null;
            return { ...evt, message };
          }
        }
        return null;
      },
      create: async ({ data }: any) => {
        // Enforce unique eventId constraint
        for (const evt of webhookEvents.values()) {
          if (evt.eventId === data.eventId) {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed on eventId', {
              code: 'P2002',
              clientVersion: '5.22.0',
            });
          }
        }

        const id = `evt_${Date.now()}_${Math.random()}`;
        const item: MockWebhookEvent = {
          id,
          eventId: data.eventId,
          messageId: data.messageId,
          status: data.status,
          occurredAt: data.occurredAt,
          processedAt: new Date(),
        };
        webhookEvents.set(data.eventId, item);
        return item;
      },
    },

    $transaction: async (callback: (tx: any) => Promise<any>) => {
      return callback(client);
    },
  };

  return client;
}

export const mockPrisma = createMockPrismaClient();
