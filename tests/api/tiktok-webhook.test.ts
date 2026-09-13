import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';

// TASK-1.5.1: the signature check itself (verifyWebhookSignature in the route) already existed
// and already rejects with 401 - this file just proves it with a regression test, which was
// missing (audited 2026-09-13, "Etap 2 powrót do pełnego backlogu EPIC 1").

process.env.TIKTOK_WEBHOOK_SECRET = 'test-only-not-a-real-tiktok-webhook-secret';

const { POST, GET } = await import('@/app/api/tiktok/webhook/route');

const WEBHOOK_URL = 'http://localhost:3000/api/tiktok/webhook';

function signedRequest(body: string, signature: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature !== null) {
    headers['x-tiktok-signature'] = signature;
  }
  return new NextRequest(WEBHOOK_URL, { method: 'POST', headers, body });
}

function validSignatureFor(body: string) {
  return createHmac('sha256', process.env.TIKTOK_WEBHOOK_SECRET as string).update(body).digest('hex');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/tiktok/webhook — signature verification', () => {
  it('accepts a request with a valid HMAC signature', async () => {
    const body = JSON.stringify({ event: 'post.publish.complete', data: { id: 'x' } });
    const response = await POST(signedRequest(body, validSignatureFor(body)));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.received).toBe(true);
  });

  it('rejects a request with an invalid signature', async () => {
    const body = JSON.stringify({ event: 'post.publish.complete', data: { id: 'x' } });
    const response = await POST(signedRequest(body, 'not-the-right-signature'));

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.message).toBe('Invalid webhook signature');
  });

  it('rejects a request with a missing signature header', async () => {
    const body = JSON.stringify({ event: 'post.publish.complete', data: { id: 'x' } });
    const response = await POST(signedRequest(body, null));

    expect(response.status).toBe(401);
  });

  it('rejects a request signed for a DIFFERENT body than the one actually sent', async () => {
    const signedBody = JSON.stringify({ event: 'a' });
    const actualBody = JSON.stringify({ event: 'b' });
    const response = await POST(signedRequest(actualBody, validSignatureFor(signedBody)));

    expect(response.status).toBe(401);
  });
});

describe('GET /api/tiktok/webhook — verification challenge', () => {
  it('echoes back the challenge query param in plain text', async () => {
    const response = await GET(new NextRequest(`${WEBHOOK_URL}?challenge=abc123`));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('abc123');
  });
});
