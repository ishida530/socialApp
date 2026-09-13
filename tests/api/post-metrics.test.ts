import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectMetricsForRecentJobs } from '@/lib/server/post-metrics';
import { encrypt } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo } from '../helpers/fixtures';

// Real post-performance metrics collection - the prerequisite the PO and I agreed on before any
// AI-driven "what performs well" claim can honestly exist. Read-only, best-effort: a job that
// fails to fetch must never affect the sweep or PublishJob itself.

let cleanupUserId: string | null = null;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

async function makeSuccessJob(
  userId: string,
  platform: 'INSTAGRAM' | 'FACEBOOK' | 'YOUTUBE' | 'TIKTOK',
  overrides: { remotePostId?: string | null; publishedAt?: Date; accessToken?: string | null } = {},
) {
  const account = await createSocialAccount(userId, platform, {
    accessToken: overrides.accessToken === undefined ? encrypt('real-looking-access-token') : overrides.accessToken,
  });
  const video = await createVideo(userId);
  return prisma.publishJob.create({
    data: {
      status: 'SUCCESS',
      postGroupId: `group-${video.id}`,
      caption: 'x',
      hashtags: [],
      scheduledFor: new Date(),
      publishedAt: overrides.publishedAt ?? new Date(),
      remotePostId: overrides.remotePostId === undefined ? `remote-${video.id}` : overrides.remotePostId,
      videoId: video.id,
      socialAccountId: account.id,
    },
  });
}

describe('collectMetricsForRecentJobs', () => {
  it('fetches Instagram like/comment counts and stores them as a PostMetric snapshot', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const job = await makeSuccessJob(user.id, 'INSTAGRAM');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ like_count: 42, comments_count: 7 }) }),
    );

    const summary = await collectMetricsForRecentJobs();
    expect(summary.updated).toBe(1);

    const metric = await prisma.postMetric.findUnique({ where: { publishJobId: job.id } });
    expect(metric?.likes).toBe(42);
    expect(metric?.comments).toBe(7);
    expect(metric?.views).toBeNull();
  });

  it('fetches Instagram views from the insights endpoint (separate call from likes/comments)', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const job = await makeSuccessJob(user.id, 'INSTAGRAM');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.toString().includes('/insights')) {
          return { ok: true, json: async () => ({ data: [{ name: 'views', values: [{ value: 321 }] }] }) };
        }
        return { ok: true, json: async () => ({ like_count: 10, comments_count: 2 }) };
      }),
    );

    await collectMetricsForRecentJobs();

    const metric = await prisma.postMetric.findUnique({ where: { publishJobId: job.id } });
    expect(metric?.views).toBe(321);
    expect(metric?.likes).toBe(10);
  });

  it('fetches YouTube view/like/comment counts from the videos.list statistics part', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const job = await makeSuccessJob(user.id, 'YOUTUBE');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [{ statistics: { viewCount: '1000', likeCount: '50', commentCount: '3' } }] }),
      }),
    );

    await collectMetricsForRecentJobs();

    const metric = await prisma.postMetric.findUnique({ where: { publishJobId: job.id } });
    expect(metric?.views).toBe(1000);
    expect(metric?.likes).toBe(50);
    expect(metric?.comments).toBe(3);
  });

  it('a fetch failure for one platform degrades to a null snapshot instead of blocking another job', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const failingJob = await makeSuccessJob(user.id, 'FACEBOOK');
    const okJob = await makeSuccessJob(user.id, 'INSTAGRAM');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.toString().includes('like_count')) {
          return { ok: true, json: async () => ({ like_count: 5, comments_count: 1 }) };
        }
        throw new Error('network error');
      }),
    );

    const summary = await collectMetricsForRecentJobs();
    expect(summary.attempted).toBe(2);
    // Both jobs get a PostMetric row (so a permanently-broken post doesn't get retried forever
    // every sweep) - the failing platform's row just has null fields instead of real numbers.
    expect(summary.updated).toBe(2);

    const okMetric = await prisma.postMetric.findUnique({ where: { publishJobId: okJob.id } });
    expect(okMetric?.likes).toBe(5);

    const failingMetric = await prisma.postMetric.findUnique({ where: { publishJobId: failingJob.id } });
    expect(failingMetric?.likes).toBeNull();
  });

  it('a thrown error during token resolution for one job does not block metrics collection for another', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const brokenTokenJob = await makeSuccessJob(user.id, 'INSTAGRAM', { accessToken: null });
    const okJob = await makeSuccessJob(user.id, 'INSTAGRAM');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ like_count: 9, comments_count: 2 }) }),
    );

    const summary = await collectMetricsForRecentJobs();
    expect(summary.attempted).toBe(2);
    // brokenTokenJob has no accessToken and no refreshToken, so refreshSocialAccessToken throws
    // - that job is skipped entirely (no PostMetric row), the other job still gets updated.
    expect(summary.updated).toBe(1);

    expect(await prisma.postMetric.findUnique({ where: { publishJobId: okJob.id } })).not.toBeNull();
    expect(await prisma.postMetric.findUnique({ where: { publishJobId: brokenTokenJob.id } })).toBeNull();
  });

  it('skips jobs with no remotePostId and jobs published outside the lookback window', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await makeSuccessJob(user.id, 'INSTAGRAM', { remotePostId: null });
    await makeSuccessJob(user.id, 'INSTAGRAM', { publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const summary = await collectMetricsForRecentJobs();
    expect(summary.attempted).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not re-fetch a job whose metric snapshot was already refreshed recently', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const job = await makeSuccessJob(user.id, 'INSTAGRAM');
    await prisma.postMetric.create({ data: { publishJobId: job.id, likes: 1, comments: 1, fetchedAt: new Date() } });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const summary = await collectMetricsForRecentJobs();
    expect(summary.attempted).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
