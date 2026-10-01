import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

// 2026-10-01: API responses must never carry SocialAccount.accessToken / refreshToken (encrypted
// at rest, but still not for the browser - and since the server-side prefetch they would also end
// up in page HTML). PUBLIC_SOCIAL_ACCOUNT_SELECT is the only shape that may leave the server.

const { GET: getSocialAccounts } = await import('@/app/api/social-accounts/route');
const { GET: getJobs } = await import('@/app/api/jobs/route');
const { GET: getPublishJobs } = await import('@/app/api/publish-jobs/route');
const { GET: getActivity } = await import('@/app/api/activity/route');
const { GET: getDrafts } = await import('@/app/api/publish-jobs/drafts/route');
const { prisma } = await import('@/lib/server/prisma');
const { encrypt } = await import('@/lib/server/crypto');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo, createDraftJob, authHeaders } =
  await import('../helpers/fixtures');

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

function get(path: string, token: string) {
  return new NextRequest(`http://localhost:3000/api${path}`, { headers: authHeaders(token) });
}

describe('API responses never include OAuth token fields', () => {
  it('social accounts, jobs, publish jobs, activity and drafts', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('secret-access') });
    await prisma.socialAccount.update({ where: { id: account.id }, data: { refreshToken: encrypt('secret-refresh') } });
    const video = await createVideo(user.id);
    await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId: `g-${user.id}` });
    await prisma.publishJob.create({
      data: { status: 'SUCCESS', postGroupId: `done-${user.id}`, caption: 'x', scheduledFor: new Date(), videoId: video.id, socialAccountId: account.id },
    });

    const responses = await Promise.all([
      getSocialAccounts(get('/social-accounts', token)),
      getJobs(get('/jobs?limit=10&offset=0', token)),
      getPublishJobs(get('/publish-jobs', token)),
      getActivity(get('/activity?limit=8&offset=0', token)),
      getDrafts(get('/publish-jobs/drafts', token)),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).not.toMatch(/accessToken|refreshToken/);
    }

    const accounts = JSON.parse(await (await getSocialAccounts(get('/social-accounts', token))).text());
    expect(accounts[0]).toMatchObject({ id: account.id, platform: 'FACEBOOK', handle: account.handle });
  });
});
