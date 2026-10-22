import { MessageStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import { WebhookPayloadInput } from '../validators/webhook.schema';

const STATUS_RANK: Record<MessageStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: -1,
};

export interface WebhookProcessingResult {
  success: boolean;
  duplicate: boolean;
  eventId: string;
  messageId: string;
  status: MessageStatus;
  transitionApplied: boolean;
  reason?: string;
}

export function shouldTransitionStatus(
  currentStatus: MessageStatus,
  newStatus: MessageStatus,
  currentLastOccurredAt: Date | null,
  newOccurredAt: Date
): boolean {
  if (currentStatus === newStatus) {
    return false;
  }

  // Terminal states cannot transition to any other status
  if (currentStatus === 'READ' || currentStatus === 'FAILED') {
    return false;
  }

  // FAILED is only accepted if message has not yet reached recipient (QUEUED or SENT)
  if (newStatus === 'FAILED') {
    return currentStatus === 'QUEUED' || currentStatus === 'SENT';
  }

  // Prevent transition if the incoming event occurred chronologically earlier than the latest processed event
  if (currentLastOccurredAt && newOccurredAt.getTime() < currentLastOccurredAt.getTime()) {
    return false;
  }

  // Forward progression according to status rank
  const currentRank = STATUS_RANK[currentStatus];
  const newRank = STATUS_RANK[newStatus];

  return newRank > currentRank;
}

export async function processWebhookEvent(input: WebhookPayloadInput): Promise<WebhookProcessingResult> {
  const occurredAtDate = new Date(input.occurredAt);

  // Fast check for existing eventId to avoid opening unnecessary transactions for simple retries
  const existingEvent = await prisma.webhookEvent.findUnique({
    where: { eventId: input.eventId },
    include: { message: true },
  });

  if (existingEvent) {
    return {
      success: true,
      duplicate: true,
      eventId: input.eventId,
      messageId: input.messageId,
      status: existingEvent.message ? existingEvent.message.status : existingEvent.status,
      transitionApplied: false,
      reason: 'Event was previously processed',
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Verify target message exists
      const message = await tx.message.findUnique({
        where: { id: input.messageId },
      });

      if (!message) {
        throw new AppError(404, 'MESSAGE_NOT_FOUND', `Message with ID '${input.messageId}' not found`);
      }

      // 2. Persist the webhook event record with unique eventId constraint
      await tx.webhookEvent.create({
        data: {
          eventId: input.eventId,
          messageId: input.messageId,
          status: input.status,
          occurredAt: occurredAtDate,
        },
      });

      // 3. Evaluate state transition and timestamp updates
      const canTransition = shouldTransitionStatus(
        message.status,
        input.status,
        message.lastEventOccurredAt,
        occurredAtDate
      );

      const updateData: Prisma.MessageUpdateInput = {};

      if (canTransition) {
        updateData.status = input.status;
        updateData.lastEventOccurredAt = message.lastEventOccurredAt
          ? new Date(Math.max(message.lastEventOccurredAt.getTime(), occurredAtDate.getTime()))
          : occurredAtDate;
      }

      // Backfill missing delivery timestamps even if status already progressed past this event
      if (input.status === 'SENT' && !message.sentAt) {
        updateData.sentAt = occurredAtDate;
      } else if (input.status === 'DELIVERED' && !message.deliveredAt) {
        updateData.deliveredAt = occurredAtDate;
      } else if (input.status === 'READ' && !message.readAt) {
        updateData.readAt = occurredAtDate;
      } else if (input.status === 'FAILED' && canTransition && !message.failedAt) {
        updateData.failedAt = occurredAtDate;
      }

      let finalStatus = message.status;

      if (Object.keys(updateData).length > 0) {
        const updated = await tx.message.update({
          where: { id: input.messageId },
          data: updateData,
        });
        finalStatus = updated.status;
      }

      return {
        success: true,
        duplicate: false,
        eventId: input.eventId,
        messageId: input.messageId,
        status: finalStatus,
        transitionApplied: canTransition,
        ...(!canTransition ? { reason: 'Ignored out-of-order or stale event' } : {}),
      };
    });
  } catch (err) {
    // Handle concurrent duplicate insertion race condition caught by PostgreSQL unique constraint
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const currentMessage = await prisma.message.findUnique({
        where: { id: input.messageId },
      });

      return {
        success: true,
        duplicate: true,
        eventId: input.eventId,
        messageId: input.messageId,
        status: currentMessage ? currentMessage.status : input.status,
        transitionApplied: false,
        reason: 'Concurrent duplicate event processed',
      };
    }

    throw err;
  }
}
