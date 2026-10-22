import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { mockPrisma } from '../helpers/mock-prisma';

vi.mock('../../src/lib/prisma', async () => {
  const { mockPrisma } = await import('../helpers/mock-prisma');
  return { prisma: mockPrisma };
});

describe('Provider Webhooks API (/api/v1/webhooks/provider)', () => {
  const app = createApp();

  beforeEach(() => {
    mockPrisma._reset();
  });

  it('processes valid sequential webhook lifecycle: QUEUED -> SENT -> DELIVERED -> READ', async () => {
    // 1. Create message
    const msgRes = await request(app)
      .post('/api/v1/messages')
      .set('x-tenant-id', 'tenant-a')
      .send({
        tenantId: 'tenant-a',
        conversationId: 'conv-100',
        to: '+919876543210',
        text: 'Hello world',
      });
    const messageId = msgRes.body.data.id;

    // 2. Webhook: SENT
    const sentRes = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: 'evt-001',
        messageId,
        status: 'SENT',
        occurredAt: '2026-10-16T08:00:00.000Z',
      });
    expect(sentRes.status).toBe(200);
    expect(sentRes.body.duplicate).toBe(false);
    expect(sentRes.body.status).toBe('SENT');
    expect(sentRes.body.transitionApplied).toBe(true);

    // 3. Webhook: DELIVERED
    const delivRes = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: 'evt-002',
        messageId,
        status: 'DELIVERED',
        occurredAt: '2026-10-16T08:01:00.000Z',
      });
    expect(delivRes.status).toBe(200);
    expect(delivRes.body.status).toBe('DELIVERED');
    expect(delivRes.body.transitionApplied).toBe(true);

    // 4. Webhook: READ
    const readRes = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: 'evt-003',
        messageId,
        status: 'READ',
        occurredAt: '2026-10-16T08:02:00.000Z',
      });
    expect(readRes.status).toBe(200);
    expect(readRes.body.status).toBe('READ');
    expect(readRes.body.transitionApplied).toBe(true);

    // Check message state
    const finalMsg = await request(app)
      .get(`/api/v1/messages/${messageId}`)
      .set('x-tenant-id', 'tenant-a');
    expect(finalMsg.body.data.status).toBe('READ');
    expect(finalMsg.body.data.sentAt).toBeDefined();
    expect(finalMsg.body.data.deliveredAt).toBeDefined();
    expect(finalMsg.body.data.readAt).toBeDefined();
  });

  it('guarantees idempotency on duplicate eventId without duplicate mutations', async () => {
    const msgRes = await request(app)
      .post('/api/v1/messages')
      .set('x-tenant-id', 'tenant-a')
      .send({
        tenantId: 'tenant-a',
        conversationId: 'conv-100',
        to: '+919876543210',
        text: 'Duplicate test',
      });
    const messageId = msgRes.body.data.id;

    // Send first event
    const firstCall = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: 'evt-dup-1',
        messageId,
        status: 'SENT',
        occurredAt: '2026-10-16T08:00:00.000Z',
      });
    expect(firstCall.status).toBe(200);
    expect(firstCall.body.duplicate).toBe(false);

    // Replay identical eventId with different status
    const secondCall = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: 'evt-dup-1',
        messageId,
        status: 'DELIVERED',
        occurredAt: '2026-10-16T08:05:00.000Z',
      });
    expect(secondCall.status).toBe(200);
    expect(secondCall.body.duplicate).toBe(true);
    expect(secondCall.body.transitionApplied).toBe(false);

    // Message status remains SENT from first processing
    const msg = await request(app)
      .get(`/api/v1/messages/${messageId}`)
      .set('x-tenant-id', 'tenant-a');
    expect(msg.body.data.status).toBe('SENT');
  });

  it('handles out-of-order events without regressing status and backfills timestamps', async () => {
    const msgRes = await request(app)
      .post('/api/v1/messages')
      .set('x-tenant-id', 'tenant-a')
      .send({
        tenantId: 'tenant-a',
        conversationId: 'conv-100',
        to: '+919876543210',
        text: 'Out of order test',
      });
    const messageId = msgRes.body.data.id;

    // 1. DELIVERED arrives FIRST
    const delivRes = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: 'evt-deliv',
        messageId,
        status: 'DELIVERED',
        occurredAt: '2026-10-16T08:02:00.000Z',
      });
    expect(delivRes.status).toBe(200);
    expect(delivRes.body.status).toBe('DELIVERED');

    // 2. Delayed SENT arrives LATER
    const sentRes = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: 'evt-sent-delayed',
        messageId,
        status: 'SENT',
        occurredAt: '2026-10-16T08:01:00.000Z',
      });
    expect(sentRes.status).toBe(200);
    expect(sentRes.body.status).toBe('DELIVERED');
    expect(sentRes.body.transitionApplied).toBe(false);

    // Check message: status is still DELIVERED, and sentAt is properly backfilled
    const msg = await request(app)
      .get(`/api/v1/messages/${messageId}`)
      .set('x-tenant-id', 'tenant-a');
    expect(msg.body.data.status).toBe('DELIVERED');
    expect(msg.body.data.sentAt).toBeDefined();
    expect(msg.body.data.deliveredAt).toBeDefined();
  });

  it('returns 404 when webhook arrives for unknown messageId', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: 'evt-missing',
        messageId: 'msg-non-existent-999',
        status: 'DELIVERED',
        occurredAt: '2026-10-16T08:00:00.000Z',
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('returns 400 validation error for invalid payload fields', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: '',
        messageId: 'msg-1',
        status: 'INVALID_STATUS',
        occurredAt: 'not-a-date',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
