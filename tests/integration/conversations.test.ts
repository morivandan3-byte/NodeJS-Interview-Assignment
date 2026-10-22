import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { mockPrisma } from '../helpers/mock-prisma';

vi.mock('../../src/lib/prisma', async () => {
  const { mockPrisma } = await import('../helpers/mock-prisma');
  return { prisma: mockPrisma };
});

describe('Conversations API (/api/v1/conversations)', () => {
  const app = createApp();

  beforeEach(() => {
    mockPrisma._reset();
  });

  it('paginates conversation messages in chronological order with cursor tie-breaking', async () => {
    // Create 5 sequential messages in conv-1
    const messageIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post('/api/v1/messages')
        .set('x-tenant-id', 'tenant-a')
        .send({
          tenantId: 'tenant-a',
          conversationId: 'conv-1',
          to: '+919876543210',
          text: `Message ${i}`,
        });
      messageIds.push(res.body.data.id);
    }

    // 1. Fetch first page of 2 messages
    const page1Res = await request(app)
      .get('/api/v1/conversations/conv-1/messages?limit=2')
      .set('x-tenant-id', 'tenant-a');

    expect(page1Res.status).toBe(200);
    expect(page1Res.body.data).toHaveLength(2);
    expect(page1Res.body.pagination.limit).toBe(2);
    expect(page1Res.body.pagination.hasMore).toBe(true);
    expect(page1Res.body.pagination.nextCursor).toBe(page1Res.body.data[1].id);

    const firstCursor = page1Res.body.pagination.nextCursor;

    // 2. Fetch second page of 2 messages using cursor
    const page2Res = await request(app)
      .get(`/api/v1/conversations/conv-1/messages?limit=2&cursor=${firstCursor}`)
      .set('x-tenant-id', 'tenant-a');

    expect(page2Res.status).toBe(200);
    expect(page2Res.body.data).toHaveLength(2);
    expect(page2Res.body.pagination.hasMore).toBe(true);
    expect(page2Res.body.data[0].id).not.toBe(firstCursor);

    const secondCursor = page2Res.body.pagination.nextCursor;

    // 3. Fetch final page
    const page3Res = await request(app)
      .get(`/api/v1/conversations/conv-1/messages?limit=2&cursor=${secondCursor}`)
      .set('x-tenant-id', 'tenant-a');

    expect(page3Res.status).toBe(200);
    expect(page3Res.body.data).toHaveLength(1);
    expect(page3Res.body.pagination.hasMore).toBe(false);
    expect(page3Res.body.pagination.nextCursor).toBeNull();
  });

  it('returns 400 when cursor is invalid or not in conversation', async () => {
    const res = await request(app)
      .get('/api/v1/conversations/conv-1/messages?cursor=invalid_cursor_id')
      .set('x-tenant-id', 'tenant-a');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURSOR');
  });

  it('returns empty array when conversation has no messages', async () => {
    const res = await request(app)
      .get('/api/v1/conversations/conv-empty/messages')
      .set('x-tenant-id', 'tenant-a');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.hasMore).toBe(false);
    expect(res.body.pagination.nextCursor).toBeNull();
  });
});
