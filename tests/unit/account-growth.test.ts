import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectAccountGrowth, getFollowerGrowth } from '@/lib/server/account-growth';
import { encrypt } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount } from '../helpers/fixtures';

// EPIC 11 Sprint 11.1 (2026-09-14): account-level growth (followers/subscribers), zero new OAuth
// scopes needed. These tests assert per-platform parsing, that a failure on one platform never
// blocks another (same defensive posture as post-metrics.ts), and that growth trends are honest
// (null, not a fabricated 0, when there's no historical snapshot to compare against).

let cleanupUserId: string | null = null;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('collectAccountGrowth', () => {
  it('fetches TikTok follower_count and stores a snapshot', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'TIKTOK', { accessToken: encrypt('real-looking-tiktok-token') });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { user: { follower_count: 1234 } } }) }),
    );

    const summary = await collectAccountGrowth();
    expect(summary.updated).toBe(1);

    const snapshot = await prisma.accountGrowthSnapshot.findFirst({ where: { socialAccount: { userId: user.id } } });
    expect(snapshot?.followerCount).toBe(1234);
  });

  it('fetches Instagram followers_count using the stored externalId', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'INSTAGRAM', { accessToken: encrypt('real-looking-ig-token') });

    let capturedUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        capturedUrl = url.toString();
        return { ok: true, json: async () => ({ followers_count: 5678 }) };
      }),
    );

    await collectAccountGrowth();

    expect(capturedUrl).toContain(account.externalId as string);
    const snapshot = await prisma.accountGrowthSnapshot.findFirst({ where: { socialAccountId: account.id } });
    expect(snapshot?.followerCount).toBe(5678);
  });

  it('fetches YouTube subscriberCount via channels.list mine=true', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'YOUTUBE', { accessToken: encrypt('real-looking-yt-token') });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ statistics: { subscriberCount: '999' } }] }) }),
    );

    const summary = await collectAccountGrowth();
    expect(summary.updated).toBe(1);
    const snapshot = await prisma.accountGrowthSnapshot.findFirst({ where: { socialAccount: { userId: user.id } } });
    expect(snapshot?.followerCount).toBe(999);
  });

  it('a failure fetching one platform does not block another account', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'TIKTOK', { accessToken: encrypt('token-a') });
    await createSocialAccount(user.id, 'INSTAGRAM', { accessToken: encrypt('token-b') });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.toString().includes('followers_count')) {
          return { ok: true, json: async () => ({ followers_count: 42 }) };
        }
        throw new Error('network error');
      }),
    );

    const summary = await collectAccountGrowth();
    expect(summary.attempted).toBe(2);
    expect(summary.updated).toBe(1);
  });

  it('skips an account with no access token and no refresh token instead of throwing', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'TIKTOK', { accessToken: null });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const summary = await collectAccountGrowth();
    expect(summary.attempted).toBe(1);
    expect(summary.updated).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getFollowerGrowth', () => {
  it('returns current count with null trend when there is only one snapshot', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'TIKTOK');
    await prisma.accountGrowthSnapshot.create({ data: { socialAccountId: account.id, followerCount: 100 } });

    const growth = await getFollowerGrowth(user.id);
    expect(growth).toEqual([{ platform: 'TIKTOK', current: 100, weekAgo: null, monthAgo: null }]);
  });

  it('computes weekAgo/monthAgo from the closest historical snapshot at or before that date', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'TIKTOK');

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    await prisma.accountGrowthSnapshot.create({ data: { socialAccountId: account.id, followerCount: 800, fetchedAt: tenDaysAgo } });
    await prisma.accountGrowthSnapshot.create({ data: { socialAccountId: account.id, followerCount: 950, fetchedAt: twoDaysAgo } });

    const growth = await getFollowerGrowth(user.id);
    // Neither snapshot is old enough to count as "a month ago" (both are <30 days old) - null,
    // not a fabricated comparison against data that isn't actually from that far back.
    expect(growth).toEqual([{ platform: 'TIKTOK', current: 950, weekAgo: 800, monthAgo: null }]);
  });

  it('returns an empty array for an account with zero snapshots (never collected yet)', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'TIKTOK');

    const growth = await getFollowerGrowth(user.id);
    expect(growth).toEqual([]);
  });
});
