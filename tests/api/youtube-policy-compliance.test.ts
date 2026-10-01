import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// YouTube API Services Developer Policies (2026-10-01):
//   - the user chooses the visibility, and the upload sends exactly that
//   - disconnecting revokes the Google grant right away and deletes the account's API data
//   - YouTube statistics older than 30 days are deleted

const { PATCH } = await import('@/app/api/publish-jobs/drafts/[id]/route');
const { DELETE } = await import('@/app/api/social-accounts/[id]/route');
const { processPublishJobImmediately } = await import('@/lib/server/publish-processor');
const { purgeStaleYouTubeApiData } = await import('@/lib/server/youtube-data-retention');
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

async function setupYouTubeJob(jobData: Record<string, unknown> = {}) {
  const { user, token } = await createTestUser();
  cleanupUserId = user.id;
  const account = await createSocialAccount(user.id, 'YOUTUBE', { accessToken: encrypt('yt-access') });
  await prisma.socialAccount.update({ where: { id: account.id }, data: { refreshToken: encrypt('yt-refresh') } });
  const video = await createVideo(user.id);
  const job = await prisma.publishJob.create({
    data: {
      status: 'DRAFT',
      postGroupId: `group-${user.id}`,
      caption: 'opis',
      hashtags: [],
      title: 'Mój film',
      scheduledFor: new Date(Date.now() - 1000),
      videoId: video.id,
      socialAccountId: account.id,
      ...jobData,
    },
  });
  return { user, token, account, job };
}

describe('YouTube visibility', () => {
  it('saves the visibility the user picked and rejects anything else', async () => {
    const { token, job } = await setupYouTubeJob();
    const patch = (body: unknown) =>
      PATCH(
        new NextRequest(`http://localhost:3000/api/publish-jobs/drafts/${job.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: job.id }) },
      );

    expect((await patch({ youtubePrivacyStatus: 'everyone' })).status).toBe(400);
    expect((await patch({ youtubePrivacyStatus: 'unlisted' })).status).toBe(200);
    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.youtubePrivacyStatus).toBe('unlisted');
  });

  it('uploads with exactly the chosen visibility', async () => {
    const { job } = await setupYouTubeJob({ status: 'PENDING', youtubePrivacyStatus: 'private' });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('upload/youtube')) {
        return new Response(JSON.stringify({ id: 'yt-video-1' }), { status: 200 });
      }
      // media download (resolveVideoBytes)
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await processPublishJobImmediately(job.id);

    const uploadCall = fetchMock.mock.calls.find(([url]) => String(url).includes('upload/youtube'));
    expect(uploadCall).toBeTruthy();
    const body = Buffer.from((uploadCall![1] as { body: Buffer }).body).toString('utf8');
    expect(body).toContain('"privacyStatus":"private"');
  });
});

describe('Disconnecting a YouTube account', () => {
  it('revokes the Google grant and deletes the account with its data', async () => {
    const { user, token, account } = await setupYouTubeJob();
    await prisma.accountGrowthSnapshot.create({ data: { socialAccountId: account.id, followerCount: 10 } });
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await DELETE(
      new NextRequest(`http://localhost:3000/api/social-accounts/${account.id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      }),
      { params: Promise.resolve({ id: account.id }) },
    );

    expect(response.status).toBe(200);
    const [revokeUrl, revokeInit] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(revokeUrl).toBe('https://oauth2.googleapis.com/revoke');
    expect(new URLSearchParams(revokeInit.body).get('token')).toBe('yt-refresh');
    expect(await prisma.socialAccount.findUnique({ where: { id: account.id } })).toBeNull();
    expect(await prisma.accountGrowthSnapshot.count({ where: { socialAccountId: account.id } })).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });
});

describe('purgeStaleYouTubeApiData', () => {
  it('deletes YouTube statistics older than 30 days, keeps recent ones and other platforms', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const youtube = await createSocialAccount(user.id, 'YOUTUBE');
    const tiktok = await createSocialAccount(user.id, 'TIKTOK');
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

    await prisma.accountGrowthSnapshot.createMany({
      data: [
        { socialAccountId: youtube.id, followerCount: 1, fetchedAt: old },
        { socialAccountId: youtube.id, followerCount: 2 },
        { socialAccountId: tiktok.id, followerCount: 3, fetchedAt: old },
      ],
    });

    await purgeStaleYouTubeApiData();

    const remaining = await prisma.accountGrowthSnapshot.findMany({
      where: { socialAccountId: { in: [youtube.id, tiktok.id] } },
      select: { followerCount: true },
      orderBy: { followerCount: 'asc' },
    });
    expect(remaining.map((row) => row.followerCount)).toEqual([2, 3]);
  });
});
