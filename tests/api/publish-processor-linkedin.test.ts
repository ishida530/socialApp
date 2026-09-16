import { afterEach, describe, expect, it, vi } from 'vitest';
import { processPublishJobImmediately } from '@/lib/server/publish-processor';
import { encrypt } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo } from '../helpers/fixtures';

// LinkedIn integration (2026-09-16, drugie konto testowe - biuro nieruchomości): profil osobisty
// (scope w_member_social), publikacja przez /rest/posts. Inaczej niż Meta/Instagram, LinkedIn nie
// pobiera materiału z publicznego URL-a ("pull") - wymaga bezpośredniego uploadu bajtów, i zwraca
// id utworzonego posta w nagłówku odpowiedzi (x-restli-id), nie w body.

type FakeResponse = {
  ok: boolean;
  text: () => Promise<string>;
  json?: () => Promise<unknown>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
  headers?: { get: (name: string) => string | null };
};

let cleanupUserId: string | null = null;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('publish-processor - LinkedIn', () => {
  it('posts a TEXT job to /rest/posts with the member URN as author, and reads the post id from x-restli-id', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'LINKEDIN', { accessToken: encrypt('real-looking-linkedin-access-token') });
    const video = await createVideo(user.id, { mediaType: 'TEXT', sourceUrl: 'text-post://no-media' });

    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: `group-li-text-${user.id}`,
        caption: 'Nowa oferta w naszym portfolio - zapraszamy do kontaktu.',
        hashtags: [],
        scheduledFor: new Date(Date.now() - 1000),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      headers: { get: (name: string) => (name === 'x-restli-id' ? 'urn:li:share:12345' : null) },
    });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processPublishJobImmediately(job.id);
    expect(outcome).toBe('succeeded');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(calledUrl).toBe('https://api.linkedin.com/rest/posts');
    expect(calledInit.headers['LinkedIn-Version']).toBeTruthy();

    const sentBody = JSON.parse(calledInit.body);
    expect(sentBody.author).toBe(`urn:li:person:${account.externalId}`);
    expect(sentBody.commentary).toContain('Nowa oferta');
    expect(sentBody.lifecycleState).toBe('PUBLISHED');

    const updatedJob = await prisma.publishJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe('SUCCESS');
    expect(updatedJob?.remotePostUrl).toContain('urn:li:share:12345');
  });

  it('uploads IMAGE bytes directly (not a pull URL) before creating the post', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'LINKEDIN', { accessToken: encrypt('token') });
    const video = await createVideo(user.id, { mediaType: 'IMAGE', sourceUrl: 'https://example.com/dom-na-sprzedaz.jpg' });

    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: `group-li-image-${user.id}`,
        caption: 'Zobaczcie tę nieruchomość.',
        hashtags: [],
        scheduledFor: new Date(Date.now() - 1000),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    const calls: Array<{ url: string; init?: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (url: string, init?: Record<string, unknown>): Promise<FakeResponse> => {
      calls.push({ url, init });

      if (url === 'https://api.linkedin.com/rest/images?action=initializeUpload') {
        return {
          ok: true,
          text: async () => '',
          json: async () => ({ value: { uploadUrl: 'https://upload.linkedin.com/put-here', image: 'urn:li:image:abc123' } }),
        };
      }

      if (url === 'https://example.com/dom-na-sprzedaz.jpg') {
        return { ok: true, text: async () => '', arrayBuffer: async () => new TextEncoder().encode('fake-image-bytes').buffer };
      }

      if (url === 'https://upload.linkedin.com/put-here') {
        return { ok: true, text: async () => '' };
      }

      if (url === 'https://api.linkedin.com/rest/posts') {
        return {
          ok: true,
          text: async () => '',
          headers: { get: (name: string) => (name === 'x-restli-id' ? 'urn:li:share:67890' : null) },
        };
      }

      throw new Error(`Unexpected fetch call in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processPublishJobImmediately(job.id);
    expect(outcome).toBe('succeeded');

    expect(calls.map((c) => c.url)).toEqual([
      'https://api.linkedin.com/rest/images?action=initializeUpload',
      'https://example.com/dom-na-sprzedaz.jpg',
      'https://upload.linkedin.com/put-here',
      'https://api.linkedin.com/rest/posts',
    ]);

    const uploadCall = calls[2];
    expect(uploadCall.init?.method).toBe('PUT');

    const postBody = JSON.parse((calls[3].init as { body: string }).body);
    expect(postBody.content).toEqual({ media: { id: 'urn:li:image:abc123' } });

    const updatedJob = await prisma.publishJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe('SUCCESS');
  });

  it('rejects a VIDEO job on LinkedIn (not yet supported by this integration) without calling fetch', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'LINKEDIN', { accessToken: encrypt('token') });
    const video = await createVideo(user.id, { mediaType: 'VIDEO' });

    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: `group-li-video-${user.id}`,
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
    expect(updatedJob?.errorMessage).toMatch(/LinkedIn.*wideo/i);
  });
});
