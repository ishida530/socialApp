import { afterEach, describe, expect, it, vi } from 'vitest';
import { processPublishJobImmediately } from '@/lib/server/publish-processor';
import { encrypt } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo } from '../helpers/fixtures';

// Proactive content suggestions (2026-09-14): a Facebook post with no attached media - the one
// Facebook publish path that must never touch job.video.sourceUrl/localPath (a placeholder Video
// row with no real file behind it, see content-suggestions.ts / telegram-notifications.ts).

let cleanupUserId: string | null = null;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('publish-processor - TEXT mediaType (Facebook status post)', () => {
  it('posts to the Graph API /feed endpoint with just a message, no file_url', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('real-looking-facebook-access-token') });
    const video = await createVideo(user.id, { mediaType: 'TEXT', sourceUrl: 'text-post://no-media', title: 'Sugerowany post' });

    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: `group-${user.id}`,
        caption: 'Co sądzicie o nowym singlu? Dajcie znać w komentarzu!',
        hashtags: [],
        scheduledFor: new Date(Date.now() - 1000),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'fb-text-post-1' }), text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processPublishJobImmediately(job.id);
    expect(outcome).toBe('succeeded');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(calledUrl).toContain('/feed');
    expect(calledUrl).not.toContain('/videos');
    expect(calledUrl).not.toContain('/photos');

    const sentBody = new URLSearchParams(calledInit.body);
    expect(sentBody.get('message')).toContain('Co sądzicie o nowym singlu?');
    expect(sentBody.has('file_url')).toBe(false);
    expect(sentBody.has('url')).toBe(false);

    const updatedJob = await prisma.publishJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe('SUCCESS');
    expect(updatedJob?.remotePostUrl).toContain('facebook.com');
  });

  it('rejects a TEXT job on any platform other than Facebook', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'INSTAGRAM', { accessToken: encrypt('token') });
    const video = await createVideo(user.id, { mediaType: 'TEXT', sourceUrl: 'text-post://no-media' });

    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: `group-ig-${user.id}`,
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(Date.now() - 1000),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processPublishJobImmediately(job.id);
    expect(outcome).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();

    const updatedJob = await prisma.publishJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe('FAILED');
    expect(updatedJob?.errorMessage).toMatch(/wyłącznie na Facebooku/);
  });
});
