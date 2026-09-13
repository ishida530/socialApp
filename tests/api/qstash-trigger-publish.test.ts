import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockVerifyQStashSignature = vi.fn();
vi.mock('@/lib/server/qstash', () => ({
  verifyQStashSignature: mockVerifyQStashSignature,
}));

const mockProcessPublishJobImmediately = vi.fn();
vi.mock('@/lib/server/publish-processor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/publish-processor')>();
  return { ...actual, processPublishJobImmediately: mockProcessPublishJobImmediately };
});

const { POST } = await import('@/app/api/qstash/trigger-publish/route');

function request(body: string, signature: string | null) {
  return new NextRequest('http://localhost:3000/api/qstash/trigger-publish', {
    method: 'POST',
    headers: signature ? { 'upstash-signature': signature } : {},
    body,
  });
}

afterEach(() => {
  mockVerifyQStashSignature.mockReset();
  mockProcessPublishJobImmediately.mockReset();
});

describe('POST /api/qstash/trigger-publish', () => {
  it('rejects a request with an invalid/missing signature before touching the body', async () => {
    mockVerifyQStashSignature.mockResolvedValue(false);

    const response = await POST(request(JSON.stringify({ jobId: 'job-1' }), 'bad-sig'));

    expect(response.status).toBe(401);
    expect(mockProcessPublishJobImmediately).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON after a valid signature', async () => {
    mockVerifyQStashSignature.mockResolvedValue(true);

    const response = await POST(request('not json', 'sig'));
    expect(response.status).toBe(400);
  });

  it('rejects a body missing jobId', async () => {
    mockVerifyQStashSignature.mockResolvedValue(true);

    const response = await POST(request(JSON.stringify({}), 'sig'));
    expect(response.status).toBe(400);
  });

  it('processes the job and returns its outcome on a valid signed request', async () => {
    mockVerifyQStashSignature.mockResolvedValue(true);
    mockProcessPublishJobImmediately.mockResolvedValue('succeeded');

    const response = await POST(request(JSON.stringify({ jobId: 'job-1' }), 'sig'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, jobId: 'job-1', outcome: 'succeeded' });
    expect(mockProcessPublishJobImmediately).toHaveBeenCalledWith('job-1');
  });

  it('returns 500 without throwing if processing errors', async () => {
    mockVerifyQStashSignature.mockResolvedValue(true);
    mockProcessPublishJobImmediately.mockRejectedValue(new Error('boom'));

    const response = await POST(request(JSON.stringify({ jobId: 'job-1' }), 'sig'));
    expect(response.status).toBe(500);
  });
});
