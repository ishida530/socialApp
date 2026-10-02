import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// "Generuj ponownie" (2026-10-02): when Claude is unavailable (e.g. exhausted credit balance) the
// template fallback used to prefix the current caption again ("Krótka aktualizacja: Krótka
// aktualizacja: ..."). Now the draft stays unchanged and the user gets a clear 503.

const { POST: regenerate } = await import('@/app/api/publish-jobs/drafts/[id]/regenerate/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo, createDraftJob, jsonRequest, authHeaders } =
  await import('../helpers/fixtures');

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
const cleanup: string[] = [];

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  for (const id of cleanup.splice(0)) await deleteTestUser(id);
});

async function draft() {
  const { user, token } = await createTestUser();
  cleanup.push(user.id);
  const account = await createSocialAccount(user.id, 'TIKTOK');
  const video = await createVideo(user.id, { mediaType: 'IMAGE' });
  const job = await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId: randomUUID() });
  return { job, token };
}

function call(jobId: string, token: string) {
  return regenerate(
    jsonRequest(`http://localhost:3000/api/publish-jobs/drafts/${jobId}/regenerate`, { timezone: 'Europe/Warsaw' }, authHeaders(token)),
    { params: Promise.resolve({ id: jobId }) },
  );
}

describe('POST /api/publish-jobs/drafts/:id/regenerate', () => {
  it('keeps the caption and returns 503 when the AI API rejects the request', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } }),
      }),
    );
    const { job, token } = await draft();

    const response = await call(job.id, token);

    expect(response.status).toBe(503);
    expect((await response.json()).message).toMatch(/niedostępny/);
    const after = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.caption).toBe('test caption');
    expect(console.error).toHaveBeenCalledWith(
      '[anthropic] request failed',
      expect.objectContaining({ status: 400, detail: expect.stringContaining('credit balance') }),
    );
  });

  it('saves the new AI caption when Claude answers', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: 'tool_use',
              name: 'generate_platform_bundles',
              input: { bundles: [{ platform: 'TIKTOK', caption: 'Nowy opis od AI', hashtags: ['remont'] }] },
            },
          ],
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      }),
    );
    const { job, token } = await draft();

    const response = await call(job.id, token);

    expect(response.status).toBe(200);
    expect((await response.json()).caption).toBe('Nowy opis od AI');
  });
});
