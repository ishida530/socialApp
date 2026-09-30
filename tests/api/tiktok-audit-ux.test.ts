import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// TikTok Content Posting API audit (rejection ref 20260913074631, reworked 2026-09-30) - the
// server side of the "Required UX Implementation" rules that the composer relies on:
//   1b  creator_info saying "can't post right now" (HTTP 200 + error.code) is surfaced, not ignored
//   1a  creator info is read for the job's own account (?socialAccountId=)
//   2c  interaction checkboxes save independently of privacy; no Duet/Stitch for photo posts

const { queryTikTokCreatorInfo, TikTokCreatorCannotPostError } = await import('@/lib/server/tiktok-creator-info');
const { GET: creatorInfoGET } = await import('@/app/api/social-accounts/tiktok/creator-info/route');
const { PATCH } = await import('@/app/api/publish-jobs/drafts/[id]/route');
const { prisma } = await import('@/lib/server/prisma');
const { encrypt } = await import('@/lib/server/crypto');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo, createDraftJob, authHeaders } =
  await import('../helpers/fixtures');

const CREATOR_INFO_OK = {
  data: {
    creator_nickname: 'Test Creator',
    creator_username: 'testcreator',
    privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
    comment_disabled: false,
    duet_disabled: false,
    stitch_disabled: false,
    max_video_post_duration_sec: 600,
  },
  error: { code: 'ok', message: '', log_id: 'log' },
};

function stubTikTokFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function createTikTokAccountWithToken(userId: string, handle: string) {
  const account = await createSocialAccount(userId, 'TIKTOK', { handle });
  return prisma.socialAccount.update({
    where: { id: account.id },
    data: { accessToken: encrypt('tiktok-access-token'), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
}

function patchRequest(id: string, body: unknown, headers: Record<string, string>) {
  return new NextRequest(`http://localhost:3000/api/publish-jobs/drafts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('queryTikTokCreatorInfo', () => {
  it('returns creator data when error.code is "ok"', async () => {
    stubTikTokFetch(CREATOR_INFO_OK);
    const info = await queryTikTokCreatorInfo('token');
    expect(info.creator_nickname).toBe('Test Creator');
  });

  it('throws TikTokCreatorCannotPostError for spam_risk_too_many_posts even with HTTP 200', async () => {
    stubTikTokFetch({ data: {}, error: { code: 'spam_risk_too_many_posts', message: 'too many' } });
    await expect(queryTikTokCreatorInfo('token')).rejects.toBeInstanceOf(TikTokCreatorCannotPostError);
  });

  it('keeps auth failures as a regular error (reconnect problem, not "try later")', async () => {
    stubTikTokFetch({ error: { code: 'access_token_invalid', message: 'expired' } }, 401);
    const error = await queryTikTokCreatorInfo('token').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TikTokCreatorCannotPostError);
  });
});

describe('GET /api/social-accounts/tiktok/creator-info', () => {
  it('reads the requested account and reports canPost=false with a user-facing reason', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const target = await createTikTokAccountWithToken(user.id, 'target-account');
    // A second, more recently updated account - the old route would have picked this one.
    await createTikTokAccountWithToken(user.id, 'other-account');

    stubTikTokFetch({ data: {}, error: { code: 'spam_risk_too_many_posts', message: 'too many' } });

    const response = await creatorInfoGET(
      new NextRequest(`http://localhost:3000/api/social-accounts/tiktok/creator-info?socialAccountId=${target.id}`, {
        headers: authHeaders(token),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.account).toEqual({ id: target.id, handle: 'target-account' });
    expect(body.canPost).toBe(false);
    expect(body.cannotPostReason).toMatch(/limit/);
  });

  it('does not expose another user\'s TikTok account', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const { user: otherUser } = await createTestUser();
    const foreign = await createTikTokAccountWithToken(otherUser.id, 'foreign');
    stubTikTokFetch(CREATOR_INFO_OK);

    try {
      const response = await creatorInfoGET(
        new NextRequest(`http://localhost:3000/api/social-accounts/tiktok/creator-info?socialAccountId=${foreign.id}`, {
          headers: authHeaders(token),
        }),
      );
      expect(response.status).toBe(400);
    } finally {
      await deleteTestUser(otherUser.id);
    }
  });
});

describe('PATCH /api/publish-jobs/drafts/:id - TikTok interaction settings', () => {
  it('saves "Allow Comment" before any privacy level has been picked', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createTikTokAccountWithToken(user.id, 'tt');
    const video = await createVideo(user.id);
    const job = await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId: `g-${user.id}` });
    stubTikTokFetch(CREATOR_INFO_OK);

    const response = await PATCH(patchRequest(job.id, { tiktokAllowComment: true }, authHeaders(token)), {
      params: Promise.resolve({ id: job.id }),
    });

    expect(response.status).toBe(200);
    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.tiktokAllowComment).toBe(true);
    // Privacy still unset - never defaulted as a side effect.
    expect(updated.tiktokPrivacyLevel).toBeNull();
  });

  it('never stores Duet/Stitch as on for a photo post', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createTikTokAccountWithToken(user.id, 'tt');
    const video = await createVideo(user.id, { mediaType: 'IMAGE' });
    const job = await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId: `g-${user.id}` });
    stubTikTokFetch(CREATOR_INFO_OK);

    const response = await PATCH(
      patchRequest(job.id, { tiktokAllowDuet: true, tiktokAllowStitch: true }, authHeaders(token)),
      { params: Promise.resolve({ id: job.id }) },
    );

    expect(response.status).toBe(200);
    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.tiktokAllowDuet).toBe(false);
    expect(updated.tiktokAllowStitch).toBe(false);
  });

  it('returns the "try again later" message when the creator cannot post right now', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createTikTokAccountWithToken(user.id, 'tt');
    const video = await createVideo(user.id);
    const job = await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId: `g-${user.id}` });
    stubTikTokFetch({ data: {}, error: { code: 'spam_risk_too_many_posts', message: 'too many' } });

    const response = await PATCH(
      patchRequest(job.id, { tiktokPrivacyLevel: 'PUBLIC_TO_EVERYONE' }, authHeaders(token)),
      { params: Promise.resolve({ id: job.id }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/Spróbuj ponownie później/);
  });
});
