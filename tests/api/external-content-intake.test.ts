import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Content-intake talks to two external services: Claude (via callClaudeTool's own fetch) and
// Vercel Blob (via put()) - Claude is exercised for real through a stubbed global fetch (same
// convention as tests/unit/content-suggestions.test.ts), Blob storage is mocked directly since
// put() needs a real BLOB_READ_WRITE_TOKEN and does its own upload protocol, not a plain fetch.
const mockPut = vi.fn().mockResolvedValue({ url: 'https://blob.example.com/external-content/fake.jpg' });
vi.mock('@vercel/blob', () => ({ put: mockPut }));

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);
const mockSendTelegramMessageWithButtons = vi.fn().mockResolvedValue({ messageId: 1 });
vi.mock('@/lib/server/telegram', () => ({
  sendTelegramMessage: mockSendTelegramMessage,
  sendTelegramMessageWithButtons: mockSendTelegramMessageWithButtons,
}));

const { POST } = await import('@/app/api/external/content-intake/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount } = await import('../helpers/fixtures');

const INTAKE_URL = 'http://localhost:3000/api/external/content-intake';
const ORIGINAL_SECRET = process.env.EXTERNAL_CONTENT_SECRET;
const ORIGINAL_ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

function claudeToolResponse(input: unknown) {
  return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'write_announcement_post', input }] }) };
}

function fakeImageResponse() {
  return {
    ok: true,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  };
}

function intakeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request(INTAKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

function authHeader() {
  return { Authorization: `Bearer ${process.env.EXTERNAL_CONTENT_SECRET}` };
}

const validListingBody = {
  type: 'listing',
  sourceRef: 'asari-999',
  title: 'Mieszkanie 3-pokojowe, Olsztyn',
  excerpt: 'Przestronne mieszkanie w centrum.',
  url: 'https://www.prymatnieruchomosci.pl/oferty/mieszkanie-olsztyn-999',
  imageUrl: 'https://img.asariweb.pl/normal/999',
  price: 650000,
  location: 'Olsztyn',
};

let cleanupUserId: string | null = null;

beforeEach(() => {
  process.env.EXTERNAL_CONTENT_SECRET = 'test-intake-secret';
  process.env.ANTHROPIC_API_KEY = 'test-key';
  mockPut.mockClear();
  mockSendTelegramMessage.mockClear();
  mockSendTelegramMessageWithButtons.mockClear();
});

afterEach(async () => {
  vi.unstubAllGlobals();

  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }

  process.env.EXTERNAL_CONTENT_SECRET = ORIGINAL_SECRET;
  process.env.ANTHROPIC_API_KEY = ORIGINAL_ANTHROPIC_KEY;
});

describe('POST /api/external/content-intake', () => {
  it('rejects a request with no bearer secret', async () => {
    const response = await POST(intakeRequest(validListingBody));
    expect(response.status).toBe(401);
  });

  it('rejects a request with the wrong bearer secret', async () => {
    const response = await POST(intakeRequest(validListingBody, { Authorization: 'Bearer wrong' }));
    expect(response.status).toBe(401);
  });

  it('rejects a payload missing required fields', async () => {
    const response = await POST(intakeRequest({ type: 'listing' }, authHeader()));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors).toEqual(expect.arrayContaining([expect.stringContaining('sourceRef'), expect.stringContaining('title')]));
  });

  it('rejects an unknown type', async () => {
    const response = await POST(intakeRequest({ ...validListingBody, type: 'newsletter' }, authHeader()));
    expect(response.status).toBe(400);
  });

  it('creates DRAFT jobs for FACEBOOK and INSTAGRAM (not LINKEDIN) for a listing, persisting the generated caption', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'FACEBOOK');
    await createSocialAccount(user.id, 'INSTAGRAM');
    await createSocialAccount(user.id, 'LINKEDIN');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('anthropic.com')) {
          return claudeToolResponse({ caption: 'Nowa oferta w Olsztynie!', hashtags: ['#Olsztyn', '#PrymatNieruchomosci'] });
        }
        return fakeImageResponse();
      }),
    );

    const response = await POST(intakeRequest(validListingBody, authHeader()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe(false);
    expect(body.jobCount).toBe(2);

    const jobs = await prisma.publishJob.findMany({
      where: { postGroupId: body.postGroupId },
      include: { socialAccount: true, video: true },
    });

    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.socialAccount.platform).sort()).toEqual(['FACEBOOK', 'INSTAGRAM']);
    jobs.forEach((job) => {
      expect(job.status).toBe('DRAFT');
      expect(job.caption).toBe('Nowa oferta w Olsztynie!');
      expect(job.hashtags).toEqual(['#Olsztyn', '#PrymatNieruchomosci']);
      expect(job.video.sourceKind).toBe('LISTING');
      expect(job.video.sourceRef).toBe('asari-999');
      expect(job.video.mediaType).toBe('IMAGE');
    });

    expect(mockSendTelegramMessageWithButtons).not.toHaveBeenCalled(); // brak telegramChatId w tym teście
  });

  it('is idempotent: a repeated sourceRef does not create a second Video/job group', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'FACEBOOK');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('anthropic.com')) {
          return claudeToolResponse({ caption: 'x', hashtags: [] });
        }
        return fakeImageResponse();
      }),
    );

    const first = await POST(intakeRequest(validListingBody, authHeader()));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.skipped).toBe(false);

    const second = await POST(intakeRequest(validListingBody, authHeader()));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.skipped).toBe(true);

    const videos = await prisma.video.findMany({ where: { sourceRef: 'asari-999' } });
    expect(videos).toHaveLength(1);
  });

  it('converts a non-JPEG source image (e.g. the blog opengraph PNG) to JPEG before upload', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'FACEBOOK');

    const { default: sharp } = await import('sharp');
    const png = await sharp({ create: { width: 4, height: 4, channels: 4, background: '#1B3A6B' } }).png().toBuffer();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('anthropic.com')) {
          return claudeToolResponse({ caption: 'x', hashtags: [] });
        }
        return {
          ok: true,
          headers: { get: () => 'image/png' },
          arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
        };
      }),
    );

    const response = await POST(intakeRequest({ ...validListingBody, sourceRef: 'blog:png-test' }, authHeader()));
    expect(response.status).toBe(200);

    const [pathname, bytes, options] = mockPut.mock.calls[0];
    expect(pathname).toMatch(/\.jpg$/);
    expect(options.contentType).toBe('image/jpeg');
    expect([...(bytes as Buffer).subarray(0, 2)]).toEqual([0xff, 0xd8]);
  });

  it('returns 400 when no connected account matches the target platforms', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'TIKTOK'); // listing targets FACEBOOK/INSTAGRAM only

    const response = await POST(intakeRequest({ ...validListingBody, sourceRef: 'asari-1000' }, authHeader()));
    expect(response.status).toBe(400);
  });
});
