import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// TikTok Content Sharing Guidelines 1b / 2b / 5c on every path that can send a TikTok post
// (2026-09-30, audit rejection ref 20260913074631) - not just the web composer's enqueue:
//   - the processor refuses a job without a manually chosen privacy, and stops (no silent
//     retries) when creator_info says the creator can't post right now
//   - /trigger + Telegram /approve and /retry can't push a TikTok job without privacy + consent
//   - any edit of a TikTok draft voids an earlier consent tick

const { processPublishJobImmediately } = await import('@/lib/server/publish-processor');
const { triggerPublishJob, retryPublishJob } = await import('@/lib/server/publish-jobs');
const { PATCH } = await import('@/app/api/publish-jobs/drafts/[id]/route');
const { prisma } = await import('@/lib/server/prisma');
const { encrypt } = await import('@/lib/server/crypto');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo, authHeaders } = await import(
  '../helpers/fixtures'
);

let cleanupUserId: string | null = null;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

async function setup(jobData: Record<string, unknown>) {
  const { user, token } = await createTestUser();
  cleanupUserId = user.id;
  const account = await createSocialAccount(user.id, 'TIKTOK', { accessToken: encrypt('tiktok-token') });
  const video = await createVideo(user.id);
  const job = await prisma.publishJob.create({
    data: {
      postGroupId: `group-${user.id}`,
      caption: 'tk caption',
      hashtags: [],
      scheduledFor: new Date(Date.now() - 1000),
      videoId: video.id,
      socialAccountId: account.id,
      status: 'PENDING',
      ...jobData,
    },
  });
  return { user, token, job };
}

describe('publish-processor - TikTok gates', () => {
  it('fails a TikTok job without a chosen privacy level right away, without calling TikTok', async () => {
    const { job } = await setup({ tiktokPrivacyLevel: null });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processPublishJobImmediately(job.id);

    expect(outcome).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe('FAILED');
    expect(updated.errorMessage).toContain('[tiktok-settings-missing]');
  });

  it('stops (FAILED, no retry) when creator_info says the creator cannot post right now', async () => {
    const { job } = await setup({ tiktokPrivacyLevel: 'PUBLIC_TO_EVERYONE', tiktokConsentAt: new Date() });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: {}, error: { code: 'spam_risk_too_many_posts', message: 'too many' } }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processPublishJobImmediately(job.id);

    expect(outcome).toBe('failed');
    // Only creator_info - the publish init was never sent.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('creator_info');
    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe('FAILED');
    expect(updated.errorMessage).toContain('[tiktok-cannot-post:spam_risk_too_many_posts]');
  });
});

describe('triggerPublishJob / retryPublishJob - TikTok', () => {
  it('refuses to trigger a TikTok DRAFT (Telegram /approve, /trigger)', async () => {
    const { user, job } = await setup({ status: 'DRAFT', tiktokPrivacyLevel: 'PUBLIC_TO_EVERYONE' });

    const result = await triggerPublishJob(user.id, job.id);

    expect(result.ok).toBe(false);
    const stillDraft = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stillDraft.status).toBe('DRAFT');
  });

  it('refuses to retry a TikTok job that never got the user\'s consent', async () => {
    const { user, job } = await setup({ status: 'CANCELED', tiktokPrivacyLevel: 'PUBLIC_TO_EVERYONE' });

    const result = await retryPublishJob(user.id, job.id);

    expect(result.ok).toBe(false);
    const unchanged = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(unchanged.status).toBe('CANCELED');
  });
});

describe('PATCH /api/publish-jobs/drafts/:id - consent is tied to the exact post', () => {
  it('clears an earlier TikTok consent when the caption changes', async () => {
    const { token, job } = await setup({
      status: 'DRAFT',
      tiktokPrivacyLevel: 'PUBLIC_TO_EVERYONE',
      tiktokConsentAt: new Date(),
    });

    const response = await PATCH(
      new NextRequest(`http://localhost:3000/api/publish-jobs/drafts/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ caption: 'edited caption' }),
      }),
      { params: Promise.resolve({ id: job.id }) },
    );

    expect(response.status).toBe(200);
    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.caption).toBe('edited caption');
    expect(updated.tiktokConsentAt).toBeNull();
  });
});
