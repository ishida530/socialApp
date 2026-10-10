import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

// Meta Data Deletion Request callback (2026-10-10): Facebook reported "postfly sent an invalid
// response" after a user removed the app and asked for their data to be deleted.

const { POST } = await import('@/app/api/meta/data-deletion/route');
const { parseMetaSignedRequest } = await import('@/lib/server/meta-data-deletion');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount } = await import('../helpers/fixtures');

const SECRET = 'test-meta-app-secret';
const saved: Record<string, string | undefined> = {};
const cleanup: string[] = [];

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signedRequest(payload: Record<string, unknown>, secret = SECRET) {
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = base64Url(createHmac('sha256', secret).update(encodedPayload).digest());
  return `${signature}.${encodedPayload}`;
}

function deletionRequest(signed: string | null) {
  const body = new URLSearchParams();
  if (signed) body.set('signed_request', signed);
  return new NextRequest('http://localhost:3000/api/meta/data-deletion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

beforeEach(() => {
  for (const key of ['FACEBOOK_CLIENT_SECRET', 'INSTAGRAM_CLIENT_SECRET']) saved[key] = process.env[key];
  process.env.FACEBOOK_CLIENT_SECRET = SECRET;
  delete process.env.INSTAGRAM_CLIENT_SECRET;
});

afterEach(async () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const id of cleanup.splice(0)) await deleteTestUser(id);
});

describe('parseMetaSignedRequest', () => {
  it('accepts a request signed with the app secret and returns the payload', () => {
    const payload = parseMetaSignedRequest(signedRequest({ algorithm: 'HMAC-SHA256', user_id: '123' }), [SECRET]);
    expect(payload?.user_id).toBe('123');
  });

  it('rejects a wrong signature, a wrong algorithm and malformed input', () => {
    expect(parseMetaSignedRequest(signedRequest({ algorithm: 'HMAC-SHA256', user_id: '1' }, 'other-secret'), [SECRET])).toBeNull();
    expect(parseMetaSignedRequest(signedRequest({ algorithm: 'MD5', user_id: '1' }), [SECRET])).toBeNull();
    expect(parseMetaSignedRequest('not-a-signed-request', [SECRET])).toBeNull();
    expect(parseMetaSignedRequest(signedRequest({ algorithm: 'HMAC-SHA256', user_id: '1' }), [])).toBeNull();
  });
});

describe('POST /api/meta/data-deletion', () => {
  it("deletes the Facebook user's Meta accounts only and answers with url + confirmation_code", async () => {
    const { user } = await createTestUser();
    cleanup.push(user.id);
    const facebookPage = await createSocialAccount(user.id, 'FACEBOOK');
    const instagram = await createSocialAccount(user.id, 'INSTAGRAM');
    const otherPersonsPage = await createSocialAccount(user.id, 'FACEBOOK');
    const tiktok = await createSocialAccount(user.id, 'TIKTOK');
    await prisma.socialAccount.updateMany({ where: { id: { in: [facebookPage.id, instagram.id] } }, data: { metaUserId: 'fb-user-1' } });
    await prisma.socialAccount.update({ where: { id: otherPersonsPage.id }, data: { metaUserId: 'fb-user-2' } });

    const response = await POST(deletionRequest(signedRequest({ algorithm: 'HMAC-SHA256', user_id: 'fb-user-1', issued_at: 1 })));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.confirmation_code).toMatch(/^[a-f0-9]{8,64}$/);
    expect(body.url).toContain(`/data-deletion?code=${body.confirmation_code}`);

    const remaining = await prisma.socialAccount.findMany({ where: { userId: user.id }, select: { id: true } });
    expect(remaining.map((account) => account.id).sort()).toEqual([otherPersonsPage.id, tiktok.id].sort());
  });

  it('answers 200 with a confirmation code even when nothing is stored for that user', async () => {
    const response = await POST(deletionRequest(signedRequest({ algorithm: 'HMAC-SHA256', user_id: 'unknown-user' })));
    expect(response.status).toBe(200);
    expect((await response.json()).confirmation_code).toBeTruthy();
  });

  it('rejects a missing or forged signed_request without deleting anything', async () => {
    const { user } = await createTestUser();
    cleanup.push(user.id);
    const page = await createSocialAccount(user.id, 'FACEBOOK');
    await prisma.socialAccount.update({ where: { id: page.id }, data: { metaUserId: 'fb-user-3' } });

    expect((await POST(deletionRequest(null))).status).toBe(400);
    expect(
      (await POST(deletionRequest(signedRequest({ algorithm: 'HMAC-SHA256', user_id: 'fb-user-3' }, 'attacker-secret')))).status,
    ).toBe(400);
    expect(await prisma.socialAccount.findUnique({ where: { id: page.id } })).not.toBeNull();
  });
});
