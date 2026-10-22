import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { mockPrisma } from '../helpers/mock-prisma';

vi.mock('../../src/lib/prisma', async () => {
  const { mockPrisma } = await import('../helpers/mock-prisma');
  return { prisma: mockPrisma };
});

describe('GET /health', () => {
  const app = createApp();

  beforeEach(() => {
    mockPrisma._reset();
  });

  it('returns 200 OK with operational status and database connection indicator', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('database', 'connected');
    expect(res.body).toHaveProperty('uptimeSeconds');
    expect(res.body).toHaveProperty('timestamp');
  });
});
