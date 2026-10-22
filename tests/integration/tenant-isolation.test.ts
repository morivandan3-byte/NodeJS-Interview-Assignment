import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { mockPrisma } from '../helpers/mock-prisma';

vi.mock('../../src/lib/prisma', async () => {
  const { mockPrisma } = await import('../helpers/mock-prisma');
  return { prisma: mockPrisma };
});

describe('Tenant Isolation Verification', () => {
  const app = createApp();

  beforeEach(() => {
    mockPrisma._reset();
  });

  it('prevents cross-tenant message retrieval', async () => {
    // Tenant A creates message
    const createRes = await request(app)
      .post('/api/v1/messages')
      .set('x-tenant-id', 'tenant-a')
      .send({
        tenantId: 'tenant-a',
        conversationId: 'conv-private',
        to: '+919876543210',
        text: 'Tenant A private message',
      });
    const messageId = createRes.body.data.id;

    // Tenant B attempts to read Tenant A's message
    const leakAttempt = await request(app)
      .get(`/api/v1/messages/${messageId}`)
      .set('x-tenant-id', 'tenant-b');

    expect(leakAttempt.status).toBe(404);
    expect(leakAttempt.body.error.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('prevents cross-tenant conversation history access', async () => {
    // Tenant A creates message in conv-100
    await request(app)
      .post('/api/v1/messages')
      .set('x-tenant-id', 'tenant-a')
      .send({
        tenantId: 'tenant-a',
        conversationId: 'conv-100',
        to: '+919876543210',
        text: 'Secret conversation',
      });

    // Tenant B attempts to read conversation conv-100
    const convLeakAttempt = await request(app)
      .get('/api/v1/conversations/conv-100/messages')
      .set('x-tenant-id', 'tenant-b');

    expect(convLeakAttempt.status).toBe(404);
    expect(convLeakAttempt.body.error.code).toBe('CONVERSATION_NOT_FOUND');
  });

  it('prevents a tenant from hijacking an existing conversation belonging to another tenant', async () => {
    // Tenant A creates conversation conv-shared-attempt
    await request(app)
      .post('/api/v1/messages')
      .set('x-tenant-id', 'tenant-a')
      .send({
        tenantId: 'tenant-a',
        conversationId: 'conv-shared-attempt',
        to: '+919876543210',
        text: 'Tenant A ownership',
      });

    // Tenant B attempts to create message inside Tenant A's conversation
    const hijackAttempt = await request(app)
      .post('/api/v1/messages')
      .set('x-tenant-id', 'tenant-b')
      .send({
        tenantId: 'tenant-b',
        conversationId: 'conv-shared-attempt',
        to: '+919876543210',
        text: 'Tenant B hijack',
      });

    expect(hijackAttempt.status).toBe(403);
    expect(hijackAttempt.body.error.code).toBe('CROSS_TENANT_CONVERSATION');
  });
});
