import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

const { PATCH } = await import('@/app/api/publish-jobs/drafts/[id]/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo, createDraftJob, authHeaders } =
  await import('../helpers/fixtures');

function patchRequest(id: string, body: unknown, headers: Record<string, string>) {
  return new NextRequest(`http://localhost:3000/api/publish-jobs/drafts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('PATCH /api/publish-jobs/drafts/:id metaPostFormat', () => {
  it('saves REELS/FEED on an Instagram video draft', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'INSTAGRAM');
    const video = await createVideo(user.id, { mediaType: 'VIDEO' });
    const job = await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId: `group-${user.id}` });

    const response = await PATCH(
      patchRequest(job.id, { metaPostFormat: 'FEED' }, authHeaders(token)),
      { params: Promise.resolve({ id: job.id }) },
    );

    expect(response.status).toBe(200);
    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.metaPostFormat).toBe('FEED');
  });

  it('saves REELS/FEED on a Facebook video draft', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id, { mediaType: 'VIDEO' });
    const job = await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId: `group-${user.id}` });

    const response = await PATCH(
      patchRequest(job.id, { metaPostFormat: 'REELS' }, authHeaders(token)),
      { params: Promise.resolve({ id: job.id }) },
    );

    expect(response.status).toBe(200);
    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.metaPostFormat).toBe('REELS');
  });

  it('rejects metaPostFormat on a TikTok draft', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'TIKTOK');
    const video = await createVideo(user.id, { mediaType: 'VIDEO' });
    const job = await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId: `group-${user.id}` });

    const response = await PATCH(
      patchRequest(job.id, { metaPostFormat: 'FEED' }, authHeaders(token)),
      { params: Promise.resolve({ id: job.id }) },
    );

    expect(response.status).toBe(400);
  });

  it('rejects metaPostFormat on an Instagram image draft (Reels concept does not apply)', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'INSTAGRAM');
    const video = await createVideo(user.id, { mediaType: 'IMAGE' });
    const job = await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId: `group-${user.id}` });

    const response = await PATCH(
      patchRequest(job.id, { metaPostFormat: 'FEED' }, authHeaders(token)),
      { params: Promise.resolve({ id: job.id }) },
    );

    expect(response.status).toBe(400);
  });

  it('rejects an unknown format value', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id, { mediaType: 'VIDEO' });
    const job = await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId: `group-${user.id}` });

    const response = await PATCH(
      patchRequest(job.id, { metaPostFormat: 'STORY' }, authHeaders(token)),
      { params: Promise.resolve({ id: job.id }) },
    );

    expect(response.status).toBe(400);
  });
});
