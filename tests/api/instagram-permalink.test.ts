import { afterEach, describe, expect, it, vi } from 'vitest';
import { processPublishJobImmediately } from '@/lib/server/publish-processor';
import { encrypt } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo } from '../helpers/fixtures';

// Feature request from real usage after TASK-3.3.1's first live publish: the Telegram bot
// should show a link to the published post, not just "Opublikowano ✓". Instagram's Graph API
// doesn't return a permalink from /media_publish itself - it needs one extra GET call
// (fields=permalink) on the published media id. This asserts that call happens and its
// result ends up as PublishJob.remotePostUrl (which the Telegram message formatter reads).

let cleanupUserId: string | null = null;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('Instagram publish fetches and stores a permalink', () => {
  it('stores the permalink from the extra GET call as remotePostUrl', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const account = await createSocialAccount(user.id, 'INSTAGRAM', {
      accessToken: encrypt('real-looking-instagram-access-token'),
    });
    const video = await createVideo(user.id);

    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: `group-${user.id}`,
        caption: 'caption',
        hashtags: [],
        scheduledFor: new Date(Date.now() - 1000),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    const fetchMock = vi.fn(async (url: string) => {
      const target = url.toString();

      if (target.includes('/media?') || (target.includes('/media') && !target.includes('media_publish') && !target.includes('permalink'))) {
        // POST {igUserId}/media -> creates the container
        return { ok: true, text: async () => '', json: async () => ({ id: 'container-1' }) };
      }
      if (target.includes('status_code')) {
        // GET container status while waiting for it to become ready
        return { ok: true, text: async () => '', json: async () => ({ status_code: 'FINISHED' }) };
      }
      if (target.includes('media_publish')) {
        return { ok: true, text: async () => '', json: async () => ({ id: 'published-media-1' }) };
      }
      if (target.includes('fields=permalink')) {
        expect(target).toContain('published-media-1');
        return {
          ok: true,
          text: async () => '',
          json: async () => ({ permalink: 'https://www.instagram.com/reel/abc123/' }),
        };
      }

      throw new Error(`Unexpected fetch in test: ${target}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processPublishJobImmediately(job.id);
    expect(outcome).toBe('succeeded');

    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe('SUCCESS');
    expect(updated.remotePostUrl).toBe('https://www.instagram.com/reel/abc123/');
  });

  it('still marks the job SUCCESS even if the permalink fetch fails (the post is already live)', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const account = await createSocialAccount(user.id, 'INSTAGRAM', {
      accessToken: encrypt('real-looking-instagram-access-token'),
    });
    const video = await createVideo(user.id);

    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: `group2-${user.id}`,
        caption: 'caption',
        hashtags: [],
        scheduledFor: new Date(Date.now() - 1000),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    const fetchMock = vi.fn(async (url: string) => {
      const target = url.toString();
      if (target.includes('fields=permalink')) {
        return { ok: false, status: 500, text: async () => 'boom' };
      }
      if (target.includes('status_code')) {
        return { ok: true, text: async () => '', json: async () => ({ status_code: 'FINISHED' }) };
      }
      if (target.includes('media_publish')) {
        return { ok: true, text: async () => '', json: async () => ({ id: 'published-media-2' }) };
      }
      return { ok: true, text: async () => '', json: async () => ({ id: 'container-2' }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processPublishJobImmediately(job.id);
    expect(outcome).toBe('succeeded');

    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe('SUCCESS');
    expect(updated.remotePostUrl).toBeNull();
  });
});
