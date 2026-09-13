import { afterEach, describe, expect, it, vi } from 'vitest';

// generatePlatformBundles calls a real LLM orchestrator - mock it so this test only exercises
// createDraftGroupForVideo's own defaulting logic, not content generation.
const mockBundles = new Map([
  ['FACEBOOK', { platform: 'FACEBOOK', title: 'FB Title', caption: 'FB caption', hashtags: [] }],
  ['INSTAGRAM', { platform: 'INSTAGRAM', title: 'IG Title', caption: 'IG caption', hashtags: [] }],
]);

vi.mock('@/lib/server/composer-drafts', () => ({
  generatePlatformBundles: vi.fn().mockResolvedValue({ bundlesByPlatform: mockBundles, orchestrationWarning: null, schedule: [] }),
}));

const { POST } = await import('@/app/api/publish-jobs/drafts/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo, authHeaders, jsonRequest } =
  await import('../helpers/fixtures');

const DRAFTS_URL = 'http://localhost:3000/api/publish-jobs/drafts';

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('createDraftGroupForVideo defaults metaPostFormat', () => {
  it('defaults Facebook and Instagram video drafts to REELS, server-side (not left to client auto-save)', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const fbAccount = await createSocialAccount(user.id, 'FACEBOOK');
    const igAccount = await createSocialAccount(user.id, 'INSTAGRAM');
    const video = await createVideo(user.id, { mediaType: 'VIDEO' });

    const response = await POST(jsonRequest(DRAFTS_URL, { videoId: video.id }, authHeaders(token)));
    expect(response.status).toBe(200);
    const body = await response.json();

    const fbJob = await prisma.publishJob.findFirst({
      where: { postGroupId: body.postGroupId, socialAccountId: fbAccount.id },
    });
    const igJob = await prisma.publishJob.findFirst({
      where: { postGroupId: body.postGroupId, socialAccountId: igAccount.id },
    });

    expect(fbJob?.metaPostFormat).toBe('REELS');
    expect(igJob?.metaPostFormat).toBe('REELS');
  });

  it('leaves metaPostFormat null for an image draft (Reels concept does not apply)', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const igAccount = await createSocialAccount(user.id, 'INSTAGRAM');
    const video = await createVideo(user.id, { mediaType: 'IMAGE' });

    const response = await POST(jsonRequest(DRAFTS_URL, { videoId: video.id }, authHeaders(token)));
    expect(response.status).toBe(200);
    const body = await response.json();

    const igJob = await prisma.publishJob.findFirst({
      where: { postGroupId: body.postGroupId, socialAccountId: igAccount.id },
    });

    expect(igJob?.metaPostFormat).toBeNull();
  });
});
