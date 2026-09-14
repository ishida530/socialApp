import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/growth/route';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, authHeaders } from '../helpers/fixtures';

// Web equivalent of the Telegram /followers command.

const URL = 'http://localhost:3000/api/growth';

function getRequest(token: string) {
  return new NextRequest(URL, { headers: authHeaders(token) });
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('GET /api/growth', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await GET(new NextRequest(URL));
    expect(response.status).toBe(401);
  });

  it('returns an empty array for an account with no connected social accounts', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await GET(getRequest(token));
    const body = await response.json();
    expect(body.growth).toEqual([]);
  });

  it('returns the current follower count with null history for a brand-new snapshot', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'INSTAGRAM');
    await prisma.accountGrowthSnapshot.create({ data: { socialAccountId: account.id, followerCount: 1000 } });

    const response = await GET(getRequest(token));
    const body = await response.json();
    expect(body.growth).toHaveLength(1);
    expect(body.growth[0]).toMatchObject({ platform: 'INSTAGRAM', current: 1000, weekAgo: null, monthAgo: null });
  });
});
