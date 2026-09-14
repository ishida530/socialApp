import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeGoal,
  formatFallbackCoachingMessage,
  generateCoachingMessage,
  getActiveGoals,
  getWeeklyCoachingData,
  hasCoachableActivity,
  setGoal,
} from '@/lib/server/coaching';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo } from '../helpers/fixtures';

// Real coaching (2026-09-14): proactive weekly check-in built on top of already-real data
// (PostMetric from EPIC 4, Fan/Sale from EPIC 5) - these tests assert the aggregation is
// correct, that a fresh/idle account never gets a manufactured message, and that the AI-enhances/
// template-fallback pattern (same as caption generation) actually degrades gracefully.

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
let cleanupUserId: string | null = null;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
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

describe('setGoal / getActiveGoals / completeGoal', () => {
  it('creates a goal and lists it as active', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await setGoal(user.id, 'Publikować 3x w tygodniu');
    const goals = await getActiveGoals(user.id);

    expect(goals).toHaveLength(1);
    expect(goals[0].description).toBe('Publikować 3x w tygodniu');
  });

  it('completing a goal removes it from the active list', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const goal = await setGoal(user.id, 'Zdobyć 50 fanów');
    const result = await completeGoal(user.id, goal.id);

    expect(result.ok).toBe(true);
    expect(await getActiveGoals(user.id)).toHaveLength(0);
  });

  it('rejects completing a goal that does not belong to the user', async () => {
    const { user: owner } = await createTestUser();
    const { user: intruder } = await createTestUser();
    cleanupUserId = owner.id;

    try {
      const goal = await setGoal(owner.id, 'Cel właściciela');
      const result = await completeGoal(intruder.id, goal.id);

      expect(result.ok).toBe(false);
      expect(await getActiveGoals(owner.id)).toHaveLength(1);
    } finally {
      await deleteTestUser(intruder.id);
    }
  });

  it('rejects completing an already-completed goal', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const goal = await setGoal(user.id, 'Cel');
    await completeGoal(user.id, goal.id);
    const secondAttempt = await completeGoal(user.id, goal.id);

    expect(secondAttempt.ok).toBe(false);
  });
});

async function makeSuccessJob(userId: string, publishedAt: Date, metric?: { views: number; likes: number }) {
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
  if (metric) {
    await prisma.postMetric.create({
      data: { publishJobId: job.id, views: metric.views, likes: metric.likes, comments: 0, shares: 0 },
    });
  }
  return job;
}

describe('getWeeklyCoachingData / hasCoachableActivity', () => {
  it('counts posts/engagement/fans/sales correctly for this week vs last week', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await makeSuccessJob(user.id, new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), { views: 100, likes: 20 }); // this week
    await makeSuccessJob(user.id, new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), { views: 100, likes: 10 }); // last week
    await prisma.fan.create({ data: { userId: user.id, email: 'fan@example.com' } });
    await prisma.sale.create({ data: { userId: user.id, product: 'x', amountCents: 5000 } });

    const data = await getWeeklyCoachingData(user.id);

    expect(data.postsThisWeek).toBe(1);
    expect(data.postsLastWeek).toBe(1);
    expect(data.engagementRateThisWeek).toBeCloseTo(0.2, 5);
    expect(data.engagementRateLastWeek).toBeCloseTo(0.1, 5);
    expect(data.newFansThisWeek).toBe(1);
    expect(data.salesThisWeekCents).toBe(5000);
  });

  it('a fresh account with zero activity and no goals is not coachable', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const data = await getWeeklyCoachingData(user.id);
    expect(hasCoachableActivity(data)).toBe(false);
  });

  it('a fresh account with an active goal IS coachable, even with zero posts', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await setGoal(user.id, 'Opublikować pierwszy post');
    const data = await getWeeklyCoachingData(user.id);

    expect(hasCoachableActivity(data)).toBe(true);
    expect(data.activeGoals).toEqual(['Opublikować pierwszy post']);
  });
});

describe('generateCoachingMessage / formatFallbackCoachingMessage', () => {
  const baseData = {
    postsThisWeek: 2,
    postsLastWeek: 1,
    engagementRateThisWeek: 0.15,
    engagementRateLastWeek: 0.1,
    newFansThisWeek: 3,
    salesThisWeekCents: 8000,
    activeGoals: ['Publikować 3x w tygodniu'],
    followerGrowth: [{ platform: 'TIKTOK', current: 1000, weekAgo: 950, monthAgo: 800 }],
  };

  it('returns a summary+suggestion from a successful Claude response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'tool_use',
              name: 'weekly_coaching_message',
              input: { summary: 'Dobry tydzień.', suggestion: 'Spróbuj publikować wieczorem.' },
            },
          ],
        }),
      }),
    );

    const message = await generateCoachingMessage(baseData, 'Jestem raperem');
    expect(message).toEqual({ summary: 'Dobry tydzień.', suggestion: 'Spróbuj publikować wieczorem.' });
  });

  it('returns null when Claude is not configured, letting the caller fall back', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const message = await generateCoachingMessage(baseData, null);
    expect(message).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the fallback message is honest and data-only, never fabricated', () => {
    const message = formatFallbackCoachingMessage(baseData);
    expect(message.summary).toContain('2');
    expect(message.summary).toContain('1');
    expect(message.suggestion).toContain('Publikować 3x w tygodniu');
  });

  it('the fallback suggestion nudges toward setting a goal when none exists', () => {
    const message = formatFallbackCoachingMessage({ ...baseData, activeGoals: [] });
    expect(message.suggestion).toMatch(/\/goal/);
  });

  it('the fallback message includes real follower growth when available', () => {
    const message = formatFallbackCoachingMessage(baseData);
    expect(message.summary).toContain('TIKTOK: +50 obserwujących');
  });

  it('the fallback message omits a platform with no historical follower data instead of guessing', () => {
    const message = formatFallbackCoachingMessage({
      ...baseData,
      followerGrowth: [{ platform: 'YOUTUBE', current: 500, weekAgo: null, monthAgo: null }],
    });
    expect(message.summary).not.toContain('YOUTUBE');
  });
});
