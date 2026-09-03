import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/tiktok-creator-info', () => ({
  fetchTikTokCreatorInfo: vi.fn().mockResolvedValue(undefined),
}));

const { POST } = await import('@/app/api/publish-jobs/enqueue/route');
const { prisma } = await import('@/lib/server/prisma');
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

// Regression / behavior coverage for plan-based limits on POST /api/publish-jobs/enqueue.
// These limits only apply in "commercial" mode (subscription.ts short-circuits every
// assertUsageAllowed/assertScheduleWindowAllowed check to a no-op, and reports the
// effective plan as BUSINESS, whenever APP_MODE=personal) — the default "personal"
// self-hosted deployment is intentionally unlimited.
//
// Every new user gets a NEW_USER_PRO_TRIAL_DAYS(=7)-day PRO trial regardless of their
// stored subscription.plan, so a freshly-created FREE-plan user resolves to an
// *effective* PRO plan and won't hit FREE limits. Tests here backdate createdAt well
// past the trial window so the FREE plan actually applies.

const ENQUEUE_URL = 'http://localhost:3000/api/publish-jobs/enqueue';
const originalAppMode = process.env.APP_MODE;
const PAST_TRIAL_CREATED_AT = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const SOON = new Date(Date.now() + 60 * 60 * 1000).toISOString();

let cleanupUserId: string | null = null;

afterEach(async () => {
  process.env.APP_MODE = originalAppMode;
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('POST /api/publish-jobs/enqueue subscription limits (commercial mode)', () => {
  it('blocks a FREE-plan user from targeting more than one platform at once', async () => {
    process.env.APP_MODE = 'commercial';
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

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/Plan Free pozwala publikować jednocześnie maksymalnie na 1 kanale/);
  });

  it('allows a FREE-plan user to target exactly one platform', async () => {
    process.env.APP_MODE = 'commercial';
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

  it('blocks enqueueing once the FREE plan\'s monthly publish_jobs usage limit (3) is reached', async () => {
    process.env.APP_MODE = 'commercial';
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

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/Przekroczono limit planu/);
  });

  it('in personal mode (default), the same FREE-plan two-platform request is NOT blocked', async () => {
    process.env.APP_MODE = 'personal';
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

    expect(response.status).toBe(200);
  });
});
