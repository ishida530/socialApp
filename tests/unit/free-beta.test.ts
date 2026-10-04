import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

// Free beta (2026-10-03): no payments, PRO for every account with a confirmed email.

const { POST: checkout } = await import('@/app/api/billing/checkout/route');
const { getEffectivePlan } = await import('@/lib/server/subscription');
const { createTestUser, deleteTestUser, authHeaders } = await import('../helpers/fixtures');

const saved = process.env.NEXT_PUBLIC_FREE_BETA;
const cleanup: string[] = [];

beforeEach(() => {
  process.env.NEXT_PUBLIC_FREE_BETA = '1';
});

afterEach(async () => {
  process.env.NEXT_PUBLIC_FREE_BETA = saved;
  for (const id of cleanup.splice(0)) await deleteTestUser(id);
});

describe('free beta', () => {
  it('gives PRO without a time limit to a confirmed account, even long after sign-up', async () => {
    const longAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const { user } = await createTestUser({ createdAt: longAgo });
    cleanup.push(user.id);
    expect(await getEffectivePlan(user.id)).toBe('PRO');
  });

  it('keeps an unconfirmed account on Free', async () => {
    const { user } = await createTestUser({ emailVerifiedAt: null });
    cleanup.push(user.id);
    expect(await getEffectivePlan(user.id)).toBe('FREE');
  });

  it('closes checkout with a clear message', async () => {
    const { user, token } = await createTestUser();
    cleanup.push(user.id);
    const response = await checkout(
      new NextRequest('http://localhost:3000/api/billing/checkout', {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'PRO' }),
      }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).message).toMatch(/teraz bezpłatny/);
  });
});
