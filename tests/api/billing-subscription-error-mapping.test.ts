import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { issueAccessToken } from '@/lib/server/auth';

const { PATCH } = await import('@/app/api/billing/subscription/route');

const SUBSCRIPTION_URL = 'http://localhost:3000/api/billing/subscription';

function patchRequest(body: unknown, token: string) {
  return new NextRequest(SUBSCRIPTION_URL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

// Regression test for the same bug class caught by tests/e2e/account-deletion.spec.ts: a
// Prisma FK violation (P2003) surfacing here as 401 would make the client's global axios
// interceptor (lib/api-client.ts) misread it as "session expired" and hard-redirect a user
// whose session is completely valid. PATCH /api/billing/subscription -> setUserPlan() does
// an upsert on Subscription.userId, which has a real FK constraint to User.id, so a JWT
// signed for a userId that was never created (no mocking needed) reliably reproduces a
// genuine Prisma P2003 through the real code path.
describe('PATCH /api/billing/subscription — Prisma error mapping', () => {
  it('a foreign-key violation (P2003) is reported as 400, not 401', async () => {
    const ghostUserId = `ghost_${randomUUID()}`;
    const token = issueAccessToken(ghostUserId, 'ghost@example.com');

    const response = await PATCH(patchRequest({ plan: 'FREE' }, token));

    expect(response.status).toBe(400);
    expect(response.status).not.toBe(401);

    const body = await response.json();
    expect(body.message).not.toMatch(/unauthorized/i);
  });
});
