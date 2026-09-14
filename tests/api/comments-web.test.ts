import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/comments/route';
import { PATCH } from '@/app/api/comments/[id]/route';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo, authHeaders, jsonRequest } from '../helpers/fixtures';
import { encrypt } from '@/lib/server/crypto';

// Web equivalent of the Telegram detected-comment Wyślij/Napisz własną/Ignoruj buttons (EPIC 11
// Sprint 11.2) - reuses the exact same lib/server/social-comments.ts functions.

const URL = 'http://localhost:3000/api/comments';

function getRequest(token: string) {
  return new NextRequest(URL, { headers: authHeaders(token) });
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

async function makePendingComment(userId: string, suggestedReply: string | null = 'Sugerowana odpowiedź') {
  const video = await createVideo(userId);
  const account = await createSocialAccount(userId, 'INSTAGRAM', { accessToken: encrypt('token') });
  const job = await prisma.publishJob.create({
    data: {
      status: 'SUCCESS',
      postGroupId: `group-${video.id}`,
      caption: 'x',
      scheduledFor: new Date(),
      publishedAt: new Date(),
      remotePostId: `remote-${video.id}`,
      videoId: video.id,
      socialAccountId: account.id,
    },
  });
  return prisma.socialComment.create({
    data: {
      userId,
      publishJobId: job.id,
      platform: 'INSTAGRAM',
      externalCommentId: `ext-${job.id}`,
      authorName: 'fan',
      text: 'Ile kosztuje?',
      suggestedReply,
      status: 'PENDING',
    },
  });
}

describe('GET /api/comments', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await GET(new NextRequest(URL));
    expect(response.status).toBe(401);
  });

  it('lists only PENDING comments belonging to the user', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const comment = await makePendingComment(user.id);

    const response = await GET(getRequest(token));
    const body = await response.json();
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].id).toBe(comment.id);
  });
});

describe('PATCH /api/comments/[id]', () => {
  it('action "accept" posts the suggested reply and marks REPLIED', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const comment = await makePendingComment(user.id, 'Sugestia');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const response = await PATCH(jsonRequest(`${URL}/${comment.id}`, { action: 'accept' }, authHeaders(token)), {
      params: Promise.resolve({ id: comment.id }),
    });
    expect(response.status).toBe(200);

    const updated = await prisma.socialComment.findUniqueOrThrow({ where: { id: comment.id } });
    expect(updated.status).toBe('REPLIED');
  });

  it('action "ignore" marks IGNORED without contacting the platform API', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const comment = await makePendingComment(user.id);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await PATCH(jsonRequest(`${URL}/${comment.id}`, { action: 'ignore' }, authHeaders(token)), {
      params: Promise.resolve({ id: comment.id }),
    });
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();

    const updated = await prisma.socialComment.findUniqueOrThrow({ where: { id: comment.id } });
    expect(updated.status).toBe('IGNORED');
  });

  it('action "reply" sends the exact custom text provided', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const comment = await makePendingComment(user.id, null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const response = await PATCH(
      jsonRequest(`${URL}/${comment.id}`, { action: 'reply', text: 'Moja własna odpowiedź' }, authHeaders(token)),
      { params: Promise.resolve({ id: comment.id }) },
    );
    expect(response.status).toBe(200);

    const updated = await prisma.socialComment.findUniqueOrThrow({ where: { id: comment.id } });
    expect(updated.status).toBe('REPLIED');
    expect(updated.suggestedReply).toBe('Moja własna odpowiedź');
  });

  it('rejects acting on a comment belonging to a different user', async () => {
    const { user: owner, token: ownerToken } = await createTestUser();
    const { user: intruder, token: intruderToken } = await createTestUser();
    cleanupUserId = owner.id;
    const comment = await makePendingComment(owner.id);

    const response = await PATCH(jsonRequest(`${URL}/${comment.id}`, { action: 'ignore' }, authHeaders(intruderToken)), {
      params: Promise.resolve({ id: comment.id }),
    });
    expect(response.status).toBe(400);

    const stillPending = await prisma.socialComment.findUniqueOrThrow({ where: { id: comment.id } });
    expect(stillPending.status).toBe('PENDING');

    await deleteTestUser(intruder.id);
  });

  it('rejects an unknown action', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const comment = await makePendingComment(user.id);

    const response = await PATCH(jsonRequest(`${URL}/${comment.id}`, { action: 'bogus' }, authHeaders(token)), {
      params: Promise.resolve({ id: comment.id }),
    });
    expect(response.status).toBe(400);
  });
});
