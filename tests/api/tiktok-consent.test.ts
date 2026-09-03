import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/tiktok-creator-info', () => ({
  fetchTikTokCreatorInfo: vi.fn().mockResolvedValue(undefined),
}));

const { POST } = await import('@/app/api/publish-jobs/enqueue/route');
const { prisma } = await import('@/lib/server/prisma');
const { currentAppMode } = await import('../helpers/mode');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo, createDraftJob, authHeaders, jsonRequest } =
  await import('../helpers/fixtures');

// Regression / behavior coverage for TikTok's stricter publish requirements on
// POST /api/publish-jobs/enqueue: TikTok needs an explicit posting-terms consent flag
// on the request AND a privacy level already chosen on the draft, before it will let a
// TikTok job move from DRAFT to PENDING.
//
// Per prompt-dla-claude-code.md: "Zgoda TikTok — identyczny w obu trybach" — this is a
// TikTok legal requirement, not a plan/billing concern, so these assertions deliberately do
// NOT branch on currentAppMode. All three cases resolve (consent/privacy-level check, or a
// single-job usage check well under any plan's limit) before or independent of anything
// APP_MODE-gated, so the same expectations must hold verbatim under both
// test:personal/test:commercial runs — that sameness is itself the thing under test.

const ENQUEUE_URL = 'http://localhost:3000/api/publish-jobs/enqueue';

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe(`POST /api/publish-jobs/enqueue TikTok consent (APP_MODE=${currentAppMode})`, () => {
  it('rejects a TikTok target without tiktokPostingConsent, leaving the draft untouched', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'TIKTOK');
    const video = await createVideo(user.id);
    const postGroupId = `group-${user.id}`;
    const job = await createDraftJob({
      videoId: video.id,
      socialAccountId: account.id,
      postGroupId,
      tiktokPrivacyLevel: 'PUBLIC_TO_EVERYONE',
    });

    const response = await POST(
      jsonRequest(
        ENQUEUE_URL,
        {
          postGroupId,
          publishNow: true,
          targetPlatforms: ['TIKTOK'],
          tiktokPostingConsent: false,
        },
        authHeaders(token),
      ),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/akceptacja warunków publikacji/);

    const stillDraft = await prisma.publishJob.findUnique({ where: { id: job.id } });
    expect(stillDraft?.status).toBe('DRAFT');
  });

  it('rejects a TikTok target with consent but no privacy level chosen yet', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'TIKTOK');
    const video = await createVideo(user.id);
    const postGroupId = `group-${user.id}`;
    const job = await createDraftJob({
      videoId: video.id,
      socialAccountId: account.id,
      postGroupId,
      tiktokPrivacyLevel: null,
    });

    const response = await POST(
      jsonRequest(
        ENQUEUE_URL,
        {
          postGroupId,
          publishNow: true,
          targetPlatforms: ['TIKTOK'],
          tiktokPostingConsent: true,
        },
        authHeaders(token),
      ),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/wybierz poziom prywatności/);

    const stillDraft = await prisma.publishJob.findUnique({ where: { id: job.id } });
    expect(stillDraft?.status).toBe('DRAFT');
    expect(stillDraft?.tiktokConsentAt).toBeNull();
  });

  it('accepts a TikTok target once consent and privacy level are both present, and stamps tiktokConsentAt', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'TIKTOK');
    const video = await createVideo(user.id);
    const postGroupId = `group-${user.id}`;
    const job = await createDraftJob({
      videoId: video.id,
      socialAccountId: account.id,
      postGroupId,
      tiktokPrivacyLevel: 'PUBLIC_TO_EVERYONE',
    });

    const response = await POST(
      jsonRequest(
        ENQUEUE_URL,
        {
          postGroupId,
          scheduledDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          publishNow: false,
          targetPlatforms: ['TIKTOK'],
          tiktokPostingConsent: true,
        },
        authHeaders(token),
      ),
    );

    expect(response.status).toBe(200);

    const updated = await prisma.publishJob.findUnique({ where: { id: job.id } });
    expect(updated?.status).toBe('PENDING');
    expect(updated?.tiktokConsentAt).not.toBeNull();
  });
});
