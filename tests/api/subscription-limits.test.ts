import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/tiktok-creator-info', () => ({
  fetchTikTokCreatorInfo: vi.fn().mockResolvedValue(undefined),
}));

const { POST } = await import('@/app/api/publish-jobs/enqueue/route');
const { prisma } = await import('@/lib/server/prisma');
const { currentAppMode } = await import('../helpers/mode');
const {
  createTestUser,
  deleteTestUser,
  createSocialAccount,
  createVideo,
  createDraftJob,
  setUserPlan,
  authHeaders,
  jsonRequest,
} = await import('../helpers/fixtures');

// Behavior coverage for plan-based limits on POST /api/publish-jobs/enqueue. These limits
// only apply in "commercial" mode (subscription.ts short-circuits every
// assertUsageAllowed/assertScheduleWindowAllowed check to a no-op, and reports the
// effective plan as BUSINESS, whenever APP_MODE=personal).
//
// APP_MODE is read from the ambient process env (set externally by test:personal /
// test:commercial), never mutated here — this file runs unmodified under both modes as two
// separate `vitest run` invocations (npm test runs both in sequence).
//
// Every new user gets a NEW_USER_PRO_TRIAL_DAYS(=7)-day PRO trial regardless of their
// stored subscription.plan, so a freshly-created FREE-plan user resolves to an *effective*
// PRO plan and won't hit FREE limits. Tests backdate createdAt well past the trial window
// so the FREE plan actually applies whenever this runs in commercial mode.

const ENQUEUE_URL = 'http://localhost:3000/api/publish-jobs/enqueue';
const PAST_TRIAL_CREATED_AT = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const SOON = new Date(Date.now() + 60 * 60 * 1000).toISOString();

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe(`POST /api/publish-jobs/enqueue subscription limits (APP_MODE=${currentAppMode})`, () => {
  it('a single-platform FREE-plan request always succeeds', async () => {
    const { user, token } = await createTestUser({ createdAt: PAST_TRIAL_CREATED_AT });
    cleanupUserId = user.id;
    await setUserPlan(user.id, 'FREE');

    const igAccount = await createSocialAccount(user.id, 'INSTAGRAM');
    const video = await createVideo(user.id);
    const postGroupId = `group-${user.id}`;
    const job = await createDraftJob({ videoId: video.id, socialAccountId: igAccount.id, postGroupId });

    const response = await POST(
      jsonRequest(
        ENQUEUE_URL,
        { postGroupId, scheduledDate: SOON, publishNow: false, targetPlatforms: ['INSTAGRAM'] },
        authHeaders(token),
      ),
    );

    expect(response.status).toBe(200);
    const updated = await prisma.publishJob.findUnique({ where: { id: job.id } });
    expect(updated?.status).not.toBe('DRAFT');
  });

  it('a FREE-plan two-platform request is blocked in commercial mode, allowed in personal mode', async () => {
    const { user, token } = await createTestUser({ createdAt: PAST_TRIAL_CREATED_AT });
    cleanupUserId = user.id;
    await setUserPlan(user.id, 'FREE');

    const igAccount = await createSocialAccount(user.id, 'INSTAGRAM');
    const fbAccount = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    const postGroupId = `group-${user.id}`;
    await createDraftJob({ videoId: video.id, socialAccountId: igAccount.id, postGroupId });
    await createDraftJob({ videoId: video.id, socialAccountId: fbAccount.id, postGroupId });

    const response = await POST(
      jsonRequest(
        ENQUEUE_URL,
        { postGroupId, scheduledDate: SOON, publishNow: false, targetPlatforms: ['INSTAGRAM', 'FACEBOOK'] },
        authHeaders(token),
      ),
    );

    if (currentAppMode === 'commercial') {
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.message).toMatch(/Plan Free pozwala publikować jednocześnie maksymalnie na 1 kanale/);
    } else {
      expect(response.status).toBe(200);
    }
  });

  it("a FREE-plan request past the monthly publish_jobs usage limit (3) is blocked in commercial mode, allowed in personal mode", async () => {
    const { user, token } = await createTestUser({ createdAt: PAST_TRIAL_CREATED_AT });
    cleanupUserId = user.id;
    await setUserPlan(user.id, 'FREE');

    const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    await prisma.usageCounter.create({
      data: { userId: user.id, metric: 'publish_jobs', periodStart, count: 3 },
    });

    const igAccount = await createSocialAccount(user.id, 'INSTAGRAM');
    const video = await createVideo(user.id);
    const postGroupId = `group-${user.id}`;
    await createDraftJob({ videoId: video.id, socialAccountId: igAccount.id, postGroupId });

    const response = await POST(
      jsonRequest(
        ENQUEUE_URL,
        { postGroupId, scheduledDate: SOON, publishNow: false, targetPlatforms: ['INSTAGRAM'] },
        authHeaders(token),
      ),
    );

    if (currentAppMode === 'commercial') {
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.message).toMatch(/Przekroczono limit planu/);
    } else {
      expect(response.status).toBe(200);
    }
  });
});
