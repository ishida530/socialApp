import { afterEach, describe, expect, it, vi } from 'vitest';

// generatePlatformBundles calls a real LLM orchestrator under the hood — mock it so the
// test is deterministic and never makes a real external API call. Distinct content per
// platform lets the assertions catch content getting mixed up or dropped between platforms,
// not just "some content survived somewhere".
const mockBundles = new Map([
  ['INSTAGRAM', { platform: 'INSTAGRAM', title: 'IG Title', caption: 'Instagram caption here', hashtags: ['#rap', '#instaonly'] }],
  ['TIKTOK', { platform: 'TIKTOK', title: 'TikTok Title', caption: 'TikTok caption here', hashtags: ['#rap', '#tiktokonly'] }],
]);

vi.mock('@/lib/server/composer-drafts', () => ({
  generatePlatformBundles: vi.fn().mockResolvedValue({
    bundlesByPlatform: mockBundles,
    orchestrationWarning: null,
  }),
}));

const { POST } = await import('@/app/api/publish-jobs/drafts/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo, authHeaders, jsonRequest } =
  await import('../helpers/fixtures');

// Regression test for the main bug that started this whole session's work: caption/hashtags
// typed/generated per platform in the composer were generated but never actually saved to
// the PublishJob record, so publish-processor.ts fell back to video.title/description at
// publish time — what the user saw in the preview was never what actually got published.
// This asserts the fix at the persistence layer directly (a DB re-read via prisma, not just
// trusting the API response), which is the part that regresses silently if it breaks again.

const DRAFTS_URL = 'http://localhost:3000/api/publish-jobs/drafts';

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('POST /api/publish-jobs/drafts content persistence', () => {
  it('persists the generated caption/hashtags/title per platform to the database, not just the API response', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const igAccount = await createSocialAccount(user.id, 'INSTAGRAM');
    const tiktokAccount = await createSocialAccount(user.id, 'TIKTOK');
    const video = await createVideo(user.id);

    const response = await POST(
      jsonRequest(
        DRAFTS_URL,
        { videoId: video.id, contentType: 'Nowy kawałek', songTitle: 'Cień miasta' },
        authHeaders(token),
      ),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.jobs).toHaveLength(2);

    // The API response itself must reflect the generated content per platform...
    const igFromResponse = body.jobs.find((j: { socialAccount: { platform: string } }) => j.socialAccount.platform === 'INSTAGRAM');
    const tiktokFromResponse = body.jobs.find((j: { socialAccount: { platform: string } }) => j.socialAccount.platform === 'TIKTOK');
    expect(igFromResponse.caption).toBe('Instagram caption here');
    expect(igFromResponse.hashtags).toEqual(['#rap', '#instaonly']);
    expect(tiktokFromResponse.caption).toBe('TikTok caption here');
    expect(tiktokFromResponse.hashtags).toEqual(['#rap', '#tiktokonly']);

    // ...but the regression this guards against is specifically about PERSISTENCE, so
    // re-read directly from the database, independent of what the API handler returned.
    const igJobInDb = await prisma.publishJob.findFirst({
      where: { postGroupId: body.postGroupId, socialAccountId: igAccount.id },
    });
    const tiktokJobInDb = await prisma.publishJob.findFirst({
      where: { postGroupId: body.postGroupId, socialAccountId: tiktokAccount.id },
    });

    expect(igJobInDb?.caption).toBe('Instagram caption here');
    expect(igJobInDb?.hashtags).toEqual(['#rap', '#instaonly']);
    expect(igJobInDb?.title).toBe('IG Title');
    expect(igJobInDb?.status).toBe('DRAFT');

    expect(tiktokJobInDb?.caption).toBe('TikTok caption here');
    expect(tiktokJobInDb?.hashtags).toEqual(['#rap', '#tiktokonly']);
    expect(tiktokJobInDb?.title).toBe('TikTok Title');
  });

  it('rejects a videoId that does not belong to the authenticated user', async () => {
    const { user: owner } = await createTestUser();
    const { user: requester, token: requesterToken } = await createTestUser();
    cleanupUserId = requester.id;
    const video = await createVideo(owner.id);

    const response = await POST(
      jsonRequest(DRAFTS_URL, { videoId: video.id }, authHeaders(requesterToken)),
    );

    expect(response.status).toBe(400);
    await deleteTestUser(owner.id);
  });
});
