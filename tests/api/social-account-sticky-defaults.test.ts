import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// New feature (2026-09-13): PATCH .../drafts/:id now also remembers the saved TikTok/Meta
// settings on the SocialAccount itself, so the NEXT draft on that account - created either by
// the web composer or by the Telegram bot (which has no settings UI of its own) - inherits them
// instead of a hardcoded default every time.

vi.mock('@/lib/server/tiktok-creator-info', () => ({
  fetchTikTokCreatorInfo: vi.fn().mockResolvedValue({
    privacy_level_options: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'],
    duet_disabled: false,
    stitch_disabled: false,
    comment_disabled: false,
  }),
}));

const mockBundles = new Map([
  ['TIKTOK', { platform: 'TIKTOK', title: 'TikTok Title', caption: 'TikTok caption', hashtags: [] }],
  ['INSTAGRAM', { platform: 'INSTAGRAM', title: 'IG Title', caption: 'IG caption', hashtags: [] }],
]);
vi.mock('@/lib/server/composer-drafts', () => ({
  generatePlatformBundles: vi.fn().mockResolvedValue({ bundlesByPlatform: mockBundles, orchestrationWarning: null, schedule: [] }),
}));

const { PATCH } = await import('@/app/api/publish-jobs/drafts/[id]/route');
const { POST: postDrafts } = await import('@/app/api/publish-jobs/drafts/route');
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

const DRAFTS_URL = 'http://localhost:3000/api/publish-jobs/drafts';

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('SocialAccount sticky defaults', () => {
  it('PATCH of tiktokPrivacyLevel persists it as the account default', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'TIKTOK');
    const video = await createVideo(user.id, { mediaType: 'VIDEO' });
    const job = await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId: `group-${user.id}` });

    const response = await PATCH(
      patchRequest(job.id, { tiktokPrivacyLevel: 'PUBLIC_TO_EVERYONE' }, authHeaders(token)),
      { params: Promise.resolve({ id: job.id }) },
    );
    expect(response.status).toBe(200);

    const updatedAccount = await prisma.socialAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(updatedAccount.lastTiktokPrivacyLevel).toBe('PUBLIC_TO_EVERYONE');
    expect(updatedAccount.lastTiktokAllowComment).toBe(true);
    expect(updatedAccount.lastTiktokAllowDuet).toBe(true);
    expect(updatedAccount.lastTiktokAllowStitch).toBe(true);
  });

  it('a new draft on that account inherits the previously saved privacy level, not the hardcoded fallback', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'TIKTOK');

    const firstVideo = await createVideo(user.id, { mediaType: 'VIDEO' });
    const firstJob = await createDraftJob({
      videoId: firstVideo.id,
      socialAccountId: account.id,
      postGroupId: `group-first-${user.id}`,
    });
    await PATCH(
      patchRequest(firstJob.id, { tiktokPrivacyLevel: 'PUBLIC_TO_EVERYONE' }, authHeaders(token)),
      { params: Promise.resolve({ id: firstJob.id }) },
    );

    const secondVideo = await createVideo(user.id, { mediaType: 'VIDEO' });
    const response = await postDrafts(jsonRequest(DRAFTS_URL, { videoId: secondVideo.id }, authHeaders(token)));
    expect(response.status).toBe(200);
    const body = await response.json();

    const secondTiktokJob = await prisma.publishJob.findFirst({
      where: { postGroupId: body.postGroupId, socialAccountId: account.id },
    });
    expect(secondTiktokJob?.tiktokPrivacyLevel).toBe('PUBLIC_TO_EVERYONE');
  });

  it('PATCH of metaPostFormat persists it, and a new Instagram draft inherits FEED instead of the REELS fallback', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'INSTAGRAM');

    const firstVideo = await createVideo(user.id, { mediaType: 'VIDEO' });
    const firstJob = await createDraftJob({
      videoId: firstVideo.id,
      socialAccountId: account.id,
      postGroupId: `group-first-${user.id}`,
    });
    const patchResponse = await PATCH(
      patchRequest(firstJob.id, { metaPostFormat: 'FEED' }, authHeaders(token)),
      { params: Promise.resolve({ id: firstJob.id }) },
    );
    expect(patchResponse.status).toBe(200);

    const updatedAccount = await prisma.socialAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(updatedAccount.lastMetaPostFormat).toBe('FEED');

    const secondVideo = await createVideo(user.id, { mediaType: 'VIDEO' });
    const response = await postDrafts(jsonRequest(DRAFTS_URL, { videoId: secondVideo.id }, authHeaders(token)));
    expect(response.status).toBe(200);
    const body = await response.json();

    const secondIgJob = await prisma.publishJob.findFirst({
      where: { postGroupId: body.postGroupId, socialAccountId: account.id },
    });
    expect(secondIgJob?.metaPostFormat).toBe('FEED');
  });
});
