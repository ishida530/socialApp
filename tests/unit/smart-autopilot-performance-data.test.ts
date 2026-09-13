import { afterEach, describe, expect, it } from 'vitest';
import { getRealPerformanceData } from '@/lib/server/smart-autopilot/performance-data';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo } from '../helpers/fixtures';

// getRealPerformanceData bridges PostMetric (stored UTC) into schedule.ts's PerformanceDataInput,
// which schedule.ts treats as LOCAL hours (same clock as its baseline hours and
// nextLocalDateAtHour) - a naive getUTCHours() here would silently misalign real data against a
// different timezone's baseline, so the local-hour conversion itself needs its own direct test,
// not just an end-to-end assertion that some correction happened.

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

// A few days ago at a fixed UTC hour - well inside the 90-day lookback window regardless of when
// this test suite actually runs (unlike a hardcoded calendar date, which can silently drift
// outside the window and make every assertion below fail for a reason unrelated to the code
// under test).
function recentUtcDate(daysAgo: number, utcHour: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(utcHour, 0, 0, 0);
  return date;
}

async function makePost(userId: string, publishedAt: Date, likes: number, comments: number, shares: number, views: number) {
  const account = await createSocialAccount(userId, 'TIKTOK');
  const video = await createVideo(userId);
  const job = await prisma.publishJob.create({
    data: {
      status: 'SUCCESS',
      postGroupId: `group-${video.id}`,
      caption: 'x',
      hashtags: [],
      scheduledFor: publishedAt,
      publishedAt,
      remotePostId: `remote-${video.id}`,
      videoId: video.id,
      socialAccountId: account.id,
    },
  });
  await prisma.postMetric.create({ data: { publishJobId: job.id, likes, comments, shares, views } });
}

describe('getRealPerformanceData', () => {
  it('converts the stored UTC publishedAt into the LOCAL hour of the given timezone', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const publishedAt = recentUtcDate(3, 19);
    // Independently computed expected local hour (not hardcoded) - correct regardless of
    // whichever DST offset is in effect whenever this suite actually runs.
    const expectedLocalHour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Warsaw', hour: 'numeric', hour12: false }).format(publishedAt),
    ) % 24;

    await makePost(user.id, publishedAt, 10, 5, 5, 100);

    const result = await getRealPerformanceData(user.id, 'Europe/Warsaw');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ platform: 'TIKTOK', hour: expectedLocalHour });
  });

  it('computes engagement rate as (likes+comments+shares)/views', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await makePost(user.id, recentUtcDate(3, 10), 40, 30, 30, 1000);

    const result = await getRealPerformanceData(user.id, 'UTC');

    expect(result[0].er).toBeCloseTo(0.1, 5);
    expect(result[0].ctr).toBeUndefined();
    expect(result[0].watchTime).toBeUndefined();
  });

  it('skips rows with no view count - no honest engagement-rate signal to divide by', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await makePost(user.id, recentUtcDate(3, 10), 10, 5, 5, 0);

    const result = await getRealPerformanceData(user.id, 'UTC');
    expect(result).toHaveLength(0);
  });

  it('averages engagement rate across multiple posts in the same platform+hour bucket', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await makePost(user.id, recentUtcDate(3, 10), 10, 0, 0, 100); // er = 0.1
    await makePost(user.id, recentUtcDate(4, 10), 30, 0, 0, 100); // er = 0.3

    const result = await getRealPerformanceData(user.id, 'UTC');

    expect(result).toHaveLength(1);
    expect(result[0].er).toBeCloseTo(0.2, 5);
  });

  it('returns an empty array for a user with no post history', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const result = await getRealPerformanceData(user.id, 'UTC');
    expect(result).toEqual([]);
  });
});
