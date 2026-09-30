import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// TikTok Content Posting API audit rejection (ref 20260913074631, 2026-09-30): Content Sharing
// Guidelines section 3 requires a "Commercial Content Disclosure" flow - a master toggle (off by
// default) that, once on, requires choosing at least one of "Your Brand" / "Branded Content"
// (also both off by default), with Branded Content additionally forbidding SELF_ONLY privacy.
// This covers the two server-side enforcement points: the composer's PATCH (partial saves as the
// user fills the panel in) and enqueueDraftGroup (the hard gate before anything reaches TikTok's
// publish API).

vi.mock('@/lib/server/tiktok-creator-info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/tiktok-creator-info')>()),
  fetchTikTokCreatorInfo: vi.fn().mockResolvedValue({
    privacy_level_options: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE', 'FOLLOWER_OF_CREATOR'],
    duet_disabled: false,
    stitch_disabled: false,
    comment_disabled: false,
  }),
}));

const { PATCH } = await import('@/app/api/publish-jobs/drafts/[id]/route');
const { POST: enqueue } = await import('@/app/api/publish-jobs/enqueue/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo, createDraftJob, authHeaders, jsonRequest } =
  await import('../helpers/fixtures');

function patchRequest(id: string, body: unknown, headers: Record<string, string>) {
  return new NextRequest(`http://localhost:3000/api/publish-jobs/drafts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const ENQUEUE_URL = 'http://localhost:3000/api/publish-jobs/enqueue';

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('PATCH /api/publish-jobs/drafts/:id - Commercial Content Disclosure', () => {
  it('persists disclosure/brand fields, all off by default', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'TIKTOK');
    const video = await createVideo(user.id);
    const job = await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId: `group-${user.id}` });

    expect(job.tiktokDisclosureEnabled).toBeNull();
    expect(job.tiktokBrandOrganic).toBeNull();
    expect(job.tiktokBrandedContent).toBeNull();

    const response = await PATCH(
      patchRequest(job.id, { tiktokDisclosureEnabled: true, tiktokBrandOrganic: true }, authHeaders(token)),
      { params: Promise.resolve({ id: job.id }) },
    );
    expect(response.status).toBe(200);

    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.tiktokDisclosureEnabled).toBe(true);
    expect(updated.tiktokBrandOrganic).toBe(true);
    expect(updated.tiktokBrandedContent).toBeNull();
  });

  it('rejects turning on Branded Content when SELF_ONLY privacy is already saved', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'TIKTOK');
    const video = await createVideo(user.id);
    const job = await createDraftJob({
      videoId: video.id,
      socialAccountId: account.id,
      postGroupId: `group-${user.id}`,
      tiktokPrivacyLevel: 'SELF_ONLY',
    });

    const response = await PATCH(
      patchRequest(job.id, { tiktokDisclosureEnabled: true, tiktokBrandedContent: true }, authHeaders(token)),
      { params: Promise.resolve({ id: job.id }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/nie może być prywatna/);
  });

  it('rejects changing privacy to SELF_ONLY when Branded Content is already saved as true', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'TIKTOK');
    const video = await createVideo(user.id);
    const job = await createDraftJob({
      videoId: video.id,
      socialAccountId: account.id,
      postGroupId: `group-${user.id}`,
      tiktokPrivacyLevel: 'PUBLIC_TO_EVERYONE',
    });
    await prisma.publishJob.update({ where: { id: job.id }, data: { tiktokDisclosureEnabled: true, tiktokBrandedContent: true } });

    const response = await PATCH(
      patchRequest(job.id, { tiktokPrivacyLevel: 'SELF_ONLY' }, authHeaders(token)),
      { params: Promise.resolve({ id: job.id }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/nie może być prywatna/);
  });
});

describe('POST /api/publish-jobs/enqueue - Commercial Content Disclosure gate', () => {
  it('rejects a TikTok target with disclosure enabled but neither brand option chosen', async () => {
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
    await prisma.publishJob.update({ where: { id: job.id }, data: { tiktokDisclosureEnabled: true } });

    const response = await enqueue(
      jsonRequest(
        ENQUEUE_URL,
        { postGroupId, publishNow: true, targetPlatforms: ['TIKTOK'], tiktokPostingConsent: true },
        authHeaders(token),
      ),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/Twoja marka.*Treść sponsorowana|Treść sponsorowana.*Twoja marka/);

    const stillDraft = await prisma.publishJob.findUnique({ where: { id: job.id } });
    expect(stillDraft?.status).toBe('DRAFT');
  });

  it('rejects a TikTok target with Branded Content chosen but SELF_ONLY privacy', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'TIKTOK');
    const video = await createVideo(user.id);
    const postGroupId = `group-${user.id}`;
    const job = await createDraftJob({
      videoId: video.id,
      socialAccountId: account.id,
      postGroupId,
      tiktokPrivacyLevel: 'SELF_ONLY',
    });
    await prisma.publishJob.update({
      where: { id: job.id },
      data: { tiktokDisclosureEnabled: true, tiktokBrandedContent: true },
    });

    const response = await enqueue(
      jsonRequest(
        ENQUEUE_URL,
        { postGroupId, publishNow: true, targetPlatforms: ['TIKTOK'], tiktokPostingConsent: true },
        authHeaders(token),
      ),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/nie może być prywatna/);
  });

  it('accepts a TikTok target once a valid disclosure choice (Your Brand) is made', async () => {
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
      tiktokConsentAt: new Date(),
    });
    await prisma.publishJob.update({
      where: { id: job.id },
      data: { tiktokDisclosureEnabled: true, tiktokBrandOrganic: true },
    });

    const response = await enqueue(
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
  });

  it('accepts a TikTok target with disclosure left off entirely (the common case)', async () => {
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
      tiktokConsentAt: new Date(),
    });

    const response = await enqueue(
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
  });
});
