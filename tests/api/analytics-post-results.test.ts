import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';

// Analytics screen (2026-10-04): statistics of the user's own published posts are shown to them,
// and "Odśwież statystyki" fetches them now.

const { GET, POST } = await import('@/app/api/analytics/posts/route');
const { prisma } = await import('@/lib/server/prisma');
const { encrypt } = await import('@/lib/server/crypto');
const { createTestUser, deleteTestUser, authHeaders, createSocialAccount, createVideo } = await import('../helpers/fixtures');

const cleanup: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const id of cleanup.splice(0)) await deleteTestUser(id);
});

async function publishedJob(userId: string, platform: 'YOUTUBE' | 'TIKTOK') {
  const account = await createSocialAccount(userId, platform, { accessToken: encrypt('platform-token') });
  const video = await createVideo(userId, { title: 'Remont elewacji' });
  return prisma.publishJob.create({
    data: {
      videoId: video.id,
      socialAccountId: account.id,
      postGroupId: randomUUID(),
      scheduledFor: new Date(),
      publishedAt: new Date(),
      status: 'SUCCESS',
      remotePostId: `remote-${randomUUID()}`,
      title: 'Elewacja po 2 dniach',
    },
  });
}

describe('/api/analytics/posts', () => {
  it('refreshes YouTube statistics now and lists them; TikTok is marked as not available yet', async () => {
    const { user, token } = await createTestUser();
    cleanup.push(user.id);
    const youtubeJob = await publishedJob(user.id, 'YOUTUBE');
    await publishedJob(user.id, 'TIKTOK');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [{ statistics: { viewCount: '12', likeCount: '3', commentCount: '1' } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(new NextRequest('http://localhost:3000/api/analytics/posts', { method: 'POST', headers: authHeaders(token) }));
    expect(response.status).toBe(200);
    const { posts } = await response.json();

    const youtube = posts.find((post: { jobId: string }) => post.jobId === youtubeJob.id);
    expect(youtube).toMatchObject({ platform: 'YOUTUBE', views: 12, likes: 3, comments: 1, metricsAvailable: true, title: 'Elewacja po 2 dniach' });
    expect(posts.find((post: { platform: string }) => post.platform === 'TIKTOK')).toMatchObject({ metricsAvailable: false });
    // TikTok is never queried (video.list is not requested before the TikTok audit).
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('tiktokapis'))).toBe(true);
  });

  it('lists only the signed-in user posts', async () => {
    const { user, token } = await createTestUser();
    const { user: other } = await createTestUser();
    cleanup.push(user.id, other.id);
    await publishedJob(other.id, 'YOUTUBE');

    const response = await GET(new NextRequest('http://localhost:3000/api/analytics/posts', { headers: authHeaders(token) }));
    expect((await response.json()).posts).toEqual([]);
  });
});
