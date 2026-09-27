import { afterEach, describe, expect, it, vi } from 'vitest';
import { encrypt } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/prisma';
import { NextRequest } from 'next/server';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo, authHeaders } from '../helpers/fixtures';

// "Sprawdź komentarze teraz": the on-demand sweep covers only the caller's posts and works without
// Telegram linked (the comment lands in the web community panel; no Telegram call is made).
const { POST } = await import('@/app/api/comments/refresh/route');

const cleanup: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const id of cleanup.splice(0)) await deleteTestUser(id);
});

async function makePublishedFacebookJob(userId: string) {
  const account = await createSocialAccount(userId, 'FACEBOOK', { accessToken: encrypt('page-token') });
  const video = await createVideo(userId);
  return prisma.publishJob.create({
    data: {
      status: 'SUCCESS',
      postGroupId: `group-${video.id}`,
      caption: 'x',
      hashtags: [],
      scheduledFor: new Date(),
      publishedAt: new Date(),
      remotePostId: `remote-${video.id}`,
      videoId: video.id,
      socialAccountId: account.id,
    },
  });
}

function refreshRequest(token: string) {
  return new NextRequest('http://localhost:3000/api/comments/refresh', { method: 'POST', headers: authHeaders(token) });
}

describe('POST /api/comments/refresh', () => {
  it("detects comments on the caller's posts only, without Telegram linked", async () => {
    const { user, token } = await createTestUser();
    const { user: other } = await createTestUser();
    cleanup.push(user.id, other.id);
    const mine = await makePublishedFacebookJob(user.id);
    const theirs = await makePublishedFacebookJob(other.id);

    const telegramCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const href = url.toString();
        if (href.includes('api.telegram.org')) telegramCalls.push(href);
        if (href.includes('graph.facebook.com') && href.includes('/comments')) {
          const postId = href.includes(mine.remotePostId!) ? 'mine' : 'theirs';
          return { ok: true, json: async () => ({ data: [{ id: `c-${postId}`, message: 'Czy oferta aktualna?', from: { name: 'Jan' } }] }) };
        }
        return { ok: false, json: async () => ({}), text: async () => '' };
      }),
    );

    const response = await POST(refreshRequest(token));
    expect(response.status).toBe(200);
    expect((await response.json()).commentsDetected).toBe(1);

    expect(await prisma.socialComment.count({ where: { publishJobId: mine.id } })).toBe(1);
    expect(await prisma.socialComment.count({ where: { publishJobId: theirs.id } })).toBe(0);
    expect(telegramCalls).toHaveLength(0);
  });

  it('requires a session', async () => {
    const response = await POST(new NextRequest('http://localhost:3000/api/comments/refresh', { method: 'POST' }));
    expect(response.status).toBe(401);
  });
});
