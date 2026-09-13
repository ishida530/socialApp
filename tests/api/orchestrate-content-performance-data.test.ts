import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// TASK-4.1.1 ("obserwuj"/"sprawdź" steps): orchestrateContent now feeds real PostMetric-derived
// engagement data into optimizeSchedule instead of that field always being empty on the internal
// path - this is the actual "check what happened, adjust the plan" loop closing for the first
// time, using genuine account data (not simulated performanceData passed in by a caller).

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

const { orchestrateContent } = await import('@/lib/server/smart-autopilot/orchestrator');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo } = await import('../helpers/fixtures');

let cleanupUserId: string | null = null;

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY; // force the heuristic/template path - schedule is what's under test here
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  }
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

// A few days ago (well inside the 90-day lookback window regardless of when this suite runs) at
// a fixed UTC hour.
async function makeHistoricalPost(userId: string, publishedAtUtcHour: number, likes: number, views: number) {
  const account = await createSocialAccount(userId, 'TIKTOK');
  const video = await createVideo(userId);
  const publishedAt = new Date();
  publishedAt.setUTCDate(publishedAt.getUTCDate() - 3);
  publishedAt.setUTCHours(publishedAtUtcHour, 0, 0, 0);
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
  await prisma.postMetric.create({ data: { publishJobId: job.id, likes, comments: 0, shares: 0, views } });
  return job;
}

describe('orchestrateContent feeds real PostMetric data into schedule optimization', () => {
  it('uses real historical engagement to shift the TikTok slot away from the plain baseline', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    // 19:00 UTC = 21:00 Europe/Warsaw (CEST, UTC+2) in June - a real local hour with strong
    // engagement, distinct from the video_creator baseline hours ([17,18,20,21] local).
    await makeHistoricalPost(user.id, 19, 500, 1000);

    const result = await orchestrateContent(user.id, {
      rawInput: 'creator nagrywa nowy reel',
      timezone: 'Europe/Warsaw',
      mode: 'manual',
      publishMode: 'draft',
      targetPlatforms: ['TIKTOK'],
      idempotencyKey: `idem-${user.id}`,
    });

    const tiktokSlot = result.schedule.find((slot) => slot.platform === 'TIKTOK');
    expect(tiktokSlot?.reason).toMatch(/korekta historyczna/i);
  });

  it('falls back to the baseline, explicitly-labeled-as-not-data-driven slot for a user with no history', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const result = await orchestrateContent(user.id, {
      rawInput: 'creator nagrywa nowy reel',
      timezone: 'Europe/Warsaw',
      mode: 'manual',
      publishMode: 'draft',
      targetPlatforms: ['TIKTOK'],
      idempotencyKey: `idem-empty-${user.id}`,
    });

    const tiktokSlot = result.schedule.find((slot) => slot.platform === 'TIKTOK');
    expect(tiktokSlot?.reason).toMatch(/brak danych historycznych/i);
  });

  it('does not override performanceData explicitly supplied by the caller', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await makeHistoricalPost(user.id, 19, 500, 1000);

    const result = await orchestrateContent(user.id, {
      rawInput: 'creator nagrywa nowy reel',
      timezone: 'Europe/Warsaw',
      mode: 'manual',
      publishMode: 'draft',
      targetPlatforms: ['TIKTOK'],
      idempotencyKey: `idem-override-${user.id}`,
      performanceData: [],
    });

    const tiktokSlot = result.schedule.find((slot) => slot.platform === 'TIKTOK');
    expect(tiktokSlot?.reason).toMatch(/brak danych historycznych/i);
  });
});
