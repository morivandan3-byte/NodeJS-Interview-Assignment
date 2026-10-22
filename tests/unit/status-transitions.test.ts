import { describe, it, expect } from 'vitest';
import { shouldTransitionStatus } from '../../src/services/webhook.service';

describe('Webhook Status Transition Policy', () => {
  const baseTime = new Date('2026-10-16T10:00:00.000Z');
  const laterTime = new Date('2026-10-16T10:05:00.000Z');
  const earlierTime = new Date('2026-10-16T09:55:00.000Z');

  it('allows valid forward progressions', () => {
    expect(shouldTransitionStatus('QUEUED', 'SENT', baseTime, laterTime)).toBe(true);
    expect(shouldTransitionStatus('SENT', 'DELIVERED', baseTime, laterTime)).toBe(true);
    expect(shouldTransitionStatus('DELIVERED', 'READ', baseTime, laterTime)).toBe(true);
    expect(shouldTransitionStatus('QUEUED', 'READ', baseTime, laterTime)).toBe(true);
  });

  it('allows FAILED only from QUEUED or SENT', () => {
    expect(shouldTransitionStatus('QUEUED', 'FAILED', baseTime, laterTime)).toBe(true);
    expect(shouldTransitionStatus('SENT', 'FAILED', baseTime, laterTime)).toBe(true);
    expect(shouldTransitionStatus('DELIVERED', 'FAILED', baseTime, laterTime)).toBe(false);
    expect(shouldTransitionStatus('READ', 'FAILED', baseTime, laterTime)).toBe(false);
  });

  it('disallows regressions from higher statuses (out-of-order events)', () => {
    expect(shouldTransitionStatus('READ', 'SENT', baseTime, laterTime)).toBe(false);
    expect(shouldTransitionStatus('READ', 'DELIVERED', baseTime, laterTime)).toBe(false);
    expect(shouldTransitionStatus('DELIVERED', 'SENT', baseTime, laterTime)).toBe(false);
    expect(shouldTransitionStatus('DELIVERED', 'QUEUED', baseTime, laterTime)).toBe(false);
  });

  it('disallows transitions out of terminal FAILED status', () => {
    expect(shouldTransitionStatus('FAILED', 'SENT', baseTime, laterTime)).toBe(false);
    expect(shouldTransitionStatus('FAILED', 'DELIVERED', baseTime, laterTime)).toBe(false);
    expect(shouldTransitionStatus('FAILED', 'READ', baseTime, laterTime)).toBe(false);
  });

  it('disallows transitions when incoming event occurred earlier than latest processed event', () => {
    expect(shouldTransitionStatus('SENT', 'DELIVERED', baseTime, earlierTime)).toBe(false);
  });

  it('returns false for identical status transitions', () => {
    expect(shouldTransitionStatus('DELIVERED', 'DELIVERED', baseTime, laterTime)).toBe(false);
  });
});
