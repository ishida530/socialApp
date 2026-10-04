import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// "Odśwież teraz" on the Growth screen (2026-10-04): takes a follower-count snapshot right away.

const { POST } = await import('@/app/api/growth/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, authHeaders, createSocialAccount } = await import('../helpers/fixtures');

const cleanup: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const id of cleanup.splice(0)) await deleteTestUser(id);
});

function refreshRequest(token: string) {
  return new NextRequest('http://localhost:3000/api/growth', { method: 'POST', headers: authHeaders(token) });
}

describe('POST /api/growth', () => {
  it('stores a snapshot now and returns the current follower count', async () => {
    const { user, token } = await createTestUser();
    cleanup.push(user.id);
    const { encrypt } = await import('@/lib/server/crypto');
    const account = await createSocialAccount(user.id, 'TIKTOK', { accessToken: encrypt('tiktok-token') });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { user: { follower_count: 42 } } }), { status: 200 })),
    );

    const response = await POST(refreshRequest(token));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.growth).toEqual([expect.objectContaining({ platform: 'TIKTOK', current: 42 })]);
    expect(await prisma.accountGrowthSnapshot.count({ where: { socialAccountId: account.id } })).toBe(1);
  });

  it('is rate limited', async () => {
    const { user, token } = await createTestUser();
    cleanup.push(user.id);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));

    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await POST(refreshRequest(token))).status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
