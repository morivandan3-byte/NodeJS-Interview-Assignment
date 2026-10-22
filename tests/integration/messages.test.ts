import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { mockPrisma } from '../helpers/mock-prisma';

vi.mock('../../src/lib/prisma', async () => {
  const { mockPrisma } = await import('../helpers/mock-prisma');
  return { prisma: mockPrisma };
});

describe('Messages API (/api/v1/messages)', () => {
  const app = createApp();

  beforeEach(() => {
    mockPrisma._reset();
  });

  describe('POST /api/v1/messages', () => {
    it('creates and queues a new message successfully', async () => {
      const res = await request(app)
        .post('/api/v1/messages')
        .set('x-tenant-id', 'tenant-a')
        .send({
          tenantId: 'tenant-a',
          conversationId: 'conv-100',
          to: '+919876543210',
          text: 'Your order has shipped',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toMatch(/^msg_/);
      expect(res.body.data.tenantId).toBe('tenant-a');
      expect(res.body.data.conversationId).toBe('conv-100');
      expect(res.body.data.to).toBe('+919876543210');
      expect(res.body.data.text).toBe('Your order has shipped');
      expect(res.body.data.status).toBe('QUEUED');
      expect(res.body.data.createdAt).toBeDefined();
    });

    it('rejects message creation when x-tenant-id header is missing', async () => {
      const res = await request(app)
        .post('/api/v1/messages')
        .send({
          tenantId: 'tenant-a',
          conversationId: 'conv-100',
          to: '+919876543210',
          text: 'Your order has shipped',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED_TENANT');
    });

    it('rejects message creation when body tenantId does not match x-tenant-id header', async () => {
      const res = await request(app)
        .post('/api/v1/messages')
        .set('x-tenant-id', 'tenant-b')
        .send({
          tenantId: 'tenant-a',
          conversationId: 'conv-100',
          to: '+919876543210',
          text: 'Your order has shipped',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_TENANT_ACCESS');
    });

    it('returns 400 validation error for missing or empty fields', async () => {
      const res = await request(app)
        .post('/api/v1/messages')
        .set('x-tenant-id', 'tenant-a')
        .send({
          tenantId: 'tenant-a',
          conversationId: '',
          to: '+919876543210',
          text: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.issues.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/messages/:messageId', () => {
    it('retrieves an existing message by ID', async () => {
      const createRes = await request(app)
        .post('/api/v1/messages')
        .set('x-tenant-id', 'tenant-a')
        .send({
          tenantId: 'tenant-a',
          conversationId: 'conv-100',
          to: '+919876543210',
          text: 'Order status update',
        });

      const messageId = createRes.body.data.id;

      const getRes = await request(app)
        .get(`/api/v1/messages/${messageId}`)
        .set('x-tenant-id', 'tenant-a');

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.id).toBe(messageId);
      expect(getRes.body.data.status).toBe('QUEUED');
      expect(getRes.body.data.text).toBe('Order status update');
    });

    it('returns 404 when message does not exist', async () => {
      const res = await request(app)
        .get('/api/v1/messages/msg_non_existent')
        .set('x-tenant-id', 'tenant-a');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('MESSAGE_NOT_FOUND');
    });
  });
});
