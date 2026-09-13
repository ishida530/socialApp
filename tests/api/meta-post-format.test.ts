import { afterEach, describe, expect, it, vi } from 'vitest';
import { processPublishJobImmediately } from '@/lib/server/publish-processor';
import { encrypt } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo } from '../helpers/fixtures';

// New task (2026-09-13, after real TikTok testing surfaced the Facebook-Reels-vs-post
// architecture question): Instagram and Facebook both had their publish "format" implicitly
// hardcoded (Instagram always REELS, Facebook always whatever Meta's algorithm decided from a
// plain /videos post) with no user control. This adds an explicit metaPostFormat ('REELS' |
// 'FEED') on the draft, defaulting to REELS to preserve prior behavior, and asserts the right
// Graph API shape gets called for each combination - including Facebook Reels' three-step
// upload protocol (start/upload/finish), which is new code, not a parameter tweak like
// Instagram's.

let cleanupUserId: string | null = null;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

async function makePendingJob(platform: 'FACEBOOK' | 'INSTAGRAM', metaPostFormat: string | null) {
  const { user } = await createTestUser();
  cleanupUserId = user.id;

  const account = await createSocialAccount(user.id, platform, {
    accessToken: encrypt('real-looking-access-token'),
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
      metaPostFormat,
    },
  });

  return job;
}

describe('Instagram publish respects metaPostFormat', () => {
  it('FEED: posts as a plain video (media_type=VIDEO, no share_to_feed)', async () => {
    const job = await makePendingJob('INSTAGRAM', 'FEED');

    let createParams: URLSearchParams | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const target = url.toString();
      if (target.endsWith('/media') && init?.body) {
        createParams = new URLSearchParams(init.body as string);
        return { ok: true, text: async () => '', json: async () => ({ id: 'container-1' }) };
      }
      if (target.includes('status_code')) {
        return { ok: true, text: async () => '', json: async () => ({ status_code: 'FINISHED' }) };
      }
      if (target.includes('media_publish')) {
        return { ok: true, text: async () => '', json: async () => ({ id: 'published-1' }) };
      }
      if (target.includes('fields=permalink')) {
        return { ok: true, text: async () => '', json: async () => ({ permalink: 'https://instagram.com/p/x' }) };
      }
      throw new Error(`Unexpected fetch: ${target}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processPublishJobImmediately(job.id);
    expect(outcome).toBe('succeeded');
    expect(createParams!.get('media_type')).toBe('VIDEO');
    expect(createParams!.get('share_to_feed')).toBeNull();
  });

  it('REELS (default, metaPostFormat null): posts as a Reel shared to feed', async () => {
    const job = await makePendingJob('INSTAGRAM', null);

    let createParams: URLSearchParams | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const target = url.toString();
      if (target.endsWith('/media') && init?.body) {
        createParams = new URLSearchParams(init.body as string);
        return { ok: true, text: async () => '', json: async () => ({ id: 'container-2' }) };
      }
      if (target.includes('status_code')) {
        return { ok: true, text: async () => '', json: async () => ({ status_code: 'FINISHED' }) };
      }
      if (target.includes('media_publish')) {
        return { ok: true, text: async () => '', json: async () => ({ id: 'published-2' }) };
      }
      if (target.includes('fields=permalink')) {
        return { ok: true, text: async () => '', json: async () => ({ permalink: 'https://instagram.com/reel/x' }) };
      }
      throw new Error(`Unexpected fetch: ${target}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processPublishJobImmediately(job.id);
    expect(outcome).toBe('succeeded');
    expect(createParams!.get('media_type')).toBe('REELS');
    expect(createParams!.get('share_to_feed')).toBe('true');
  });
});

describe('Facebook publish respects metaPostFormat', () => {
  it('FEED: posts through the plain /videos endpoint (single request)', async () => {
    const job = await makePendingJob('FACEBOOK', 'FEED');

    const calledUrls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calledUrls.push(url.toString());
      return { ok: true, text: async () => '', json: async () => ({ id: 'post-1', post_id: 'page_post-1' }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processPublishJobImmediately(job.id);
    expect(outcome).toBe('succeeded');
    expect(calledUrls).toHaveLength(1);
    expect(calledUrls[0]).toContain('/videos');

    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.remotePostUrl).toBe('https://www.facebook.com/page_post-1');
  });

  it('REELS (default, metaPostFormat null): runs the three-step video_reels upload', async () => {
    const job = await makePendingJob('FACEBOOK', null);

    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const target = url.toString();
      calls.push({ url: target, init });

      if (target.includes('/video_reels') && init?.body?.toString().includes('upload_phase=start')) {
        return {
          ok: true,
          text: async () => '',
          json: async () => ({ video_id: 'reel-vid-1', upload_url: 'https://rupload.facebook.com/video-upload/reel-vid-1' }),
        };
      }
      if (target.includes('rupload.facebook.com')) {
        return { ok: true, text: async () => '', json: async () => ({ success: true }) };
      }
      if (target.includes('/video_reels') && init?.body?.toString().includes('upload_phase=finish')) {
        return { ok: true, text: async () => '', json: async () => ({ success: true }) };
      }
      if (target.includes('fields=permalink_url')) {
        return { ok: true, text: async () => '', json: async () => ({ permalink_url: '/reel/reel-vid-1/' }) };
      }
      throw new Error(`Unexpected fetch: ${target}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processPublishJobImmediately(job.id);
    expect(outcome).toBe('succeeded');

    expect(calls.some((c) => c.url.includes('/video_reels') && c.init?.body?.toString().includes('upload_phase=start'))).toBe(true);
    expect(calls.some((c) => c.url.includes('rupload.facebook.com'))).toBe(true);
    expect(calls.some((c) => c.url.includes('/video_reels') && c.init?.body?.toString().includes('upload_phase=finish'))).toBe(true);

    const uploadCall = calls.find((c) => c.url.includes('rupload.facebook.com'));
    const headers = uploadCall?.init?.headers as Record<string, string>;
    expect(headers.file_url).toContain('fake.mp4');
    expect(headers.Authorization).toContain('OAuth');

    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.remotePostId).toBe('reel-vid-1');
    expect(updated.remotePostUrl).toBe('https://www.facebook.com/reel/reel-vid-1/');
  });

  it('still succeeds if the Reel permalink fetch fails (the reel is already published)', async () => {
    const job = await makePendingJob('FACEBOOK', 'REELS');

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const target = url.toString();
      if (target.includes('fields=permalink_url')) {
        return { ok: false, status: 500, text: async () => 'boom' };
      }
      if (target.includes('/video_reels') && init?.body?.toString().includes('upload_phase=start')) {
        return {
          ok: true,
          text: async () => '',
          json: async () => ({ video_id: 'reel-vid-2', upload_url: 'https://rupload.facebook.com/video-upload/reel-vid-2' }),
        };
      }
      return { ok: true, text: async () => '', json: async () => ({ success: true }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processPublishJobImmediately(job.id);
    expect(outcome).toBe('succeeded');

    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe('SUCCESS');
    expect(updated.remotePostUrl).toBeNull();
  });
});
