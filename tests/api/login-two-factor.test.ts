import { randomUUID } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as twoFactorLoginRoute } from '@/app/api/auth/2fa/login/route';
import { POST as setupRoute } from '@/app/api/auth/2fa/setup/route';
import { POST as enableRoute } from '@/app/api/auth/2fa/enable/route';
import { prisma } from '@/lib/server/prisma';
import { hashPassword } from '@/lib/server/crypto';
import { createTestUser, deleteTestUser, authHeaders, jsonRequest } from '../helpers/fixtures';

// EPIC 9 TASK-9.3 (2FA, 2026-09-15) - the login flow itself: password-only accounts still log in
// in one step, 2FA accounts get a pending token instead of a session until a second step
// succeeds. Every request below gets its own randomized x-forwarded-for IP - the login/2fa-login
// routes rate-limit per IP, and a shared 'unknown' bucket across many test cases in one file would
// make this flaky by construction, independent of anything actually being wrong.

const LOGIN_URL = 'http://localhost:3000/api/auth/login';
const TWO_FA_LOGIN_URL = 'http://localhost:3000/api/auth/2fa/login';
const SETUP_URL = 'http://localhost:3000/api/auth/2fa/setup';
const ENABLE_URL = 'http://localhost:3000/api/auth/2fa/enable';

function loginRequest(url: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': `10.0.0.${randomUUID().slice(0, 2)}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

// Extracts one cookie's value out of a `Set-Cookie` response header - the login-route tests
// below need to carry the 2FA "remember this device" cookie from one request into the next,
// which NextRequest has no built-in cookie jar for across independent calls.
function extractCookieValue(setCookieHeader: string | null, cookieName: string): string {
  if (!setCookieHeader) {
    throw new Error(`No Set-Cookie header present (looking for ${cookieName})`);
  }
  const match = setCookieHeader.match(new RegExp(`${cookieName}=([^;]+)`));
  if (!match) {
    throw new Error(`Cookie ${cookieName} not found in Set-Cookie header: ${setCookieHeader}`);
  }
  return match[1];
}

function computeCode(base32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of base32.toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const secret = Buffer.from(bytes);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(truncated % 1_000_000).padStart(6, '0');
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

async function enableTwoFactorFor(userId: string, token: string): Promise<string> {
  const setupResponse = await setupRoute(jsonRequest(SETUP_URL, {}, authHeaders(token)));
  const { secret } = await setupResponse.json();
  await enableRoute(jsonRequest(ENABLE_URL, { code: computeCode(secret) }, authHeaders(token)));
  return secret;
}

describe('POST /api/auth/login - without 2FA', () => {
  it('logs in immediately with a session cookie, exactly as before this feature existed', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword('correct-password') } });

    const response = await loginRoute(loginRequest(LOGIN_URL, { email: user.email, password: 'correct-password' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.requiresTwoFactor).toBeUndefined();
    expect(response.headers.get('set-cookie')).toContain('postfly_token=');
  });
});

describe('POST /api/auth/login - with 2FA enabled', () => {
  it('returns requiresTwoFactor + a pendingToken instead of a session cookie', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword('correct-password') } });
    await enableTwoFactorFor(user.id, token);

    const response = await loginRoute(loginRequest(LOGIN_URL, { email: user.email, password: 'correct-password' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.requiresTwoFactor).toBe(true);
    expect(typeof body.pendingToken).toBe('string');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('never issues a pending token for a wrong password', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword('correct-password') } });
    await enableTwoFactorFor(user.id, token);

    const response = await loginRoute(loginRequest(LOGIN_URL, { email: user.email, password: 'wrong-password' }));
    expect(response.status).toBe(401);
  });
});

describe('POST /api/auth/2fa/login', () => {
  it('completes login with a valid pendingToken + correct code', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword('correct-password') } });
    const secret = await enableTwoFactorFor(user.id, token);

    const loginResponse = await loginRoute(loginRequest(LOGIN_URL, { email: user.email, password: 'correct-password' }));
    const { pendingToken } = await loginResponse.json();

    const response = await twoFactorLoginRoute(loginRequest(TWO_FA_LOGIN_URL, { pendingToken, code: computeCode(secret) }));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('postfly_token=');
  });

  it('accepts a valid backup code as an alternative to the TOTP code', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword('correct-password') } });
    const setupResponse = await setupRoute(jsonRequest(SETUP_URL, {}, authHeaders(token)));
    const { secret } = await setupResponse.json();
    const enableResponse = await enableRoute(jsonRequest(ENABLE_URL, { code: computeCode(secret) }, authHeaders(token)));
    const { backupCodes } = await enableResponse.json();

    const loginResponse = await loginRoute(loginRequest(LOGIN_URL, { email: user.email, password: 'correct-password' }));
    const { pendingToken } = await loginResponse.json();

    const response = await twoFactorLoginRoute(loginRequest(TWO_FA_LOGIN_URL, { pendingToken, code: backupCodes[0] }));
    expect(response.status).toBe(200);
  });

  it('rejects a wrong code', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword('correct-password') } });
    await enableTwoFactorFor(user.id, token);

    const loginResponse = await loginRoute(loginRequest(LOGIN_URL, { email: user.email, password: 'correct-password' }));
    const { pendingToken } = await loginResponse.json();

    const response = await twoFactorLoginRoute(loginRequest(TWO_FA_LOGIN_URL, { pendingToken, code: '000000' }));
    expect(response.status).toBe(401);
  });

  it('rejects a real (non-pending) session token used in place of a pendingToken', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword('correct-password') } });
    const secret = await enableTwoFactorFor(user.id, token);

    // `token` here is a REAL access token (from createTestUser), not a pending-2FA token - this
    // is exactly the confused-deputy scenario verifyPendingTwoFactorToken's `purpose` check
    // exists to prevent.
    const response = await twoFactorLoginRoute(loginRequest(TWO_FA_LOGIN_URL, { pendingToken: token, code: computeCode(secret) }));
    expect(response.status).toBe(401);
  });
});

describe('POST /api/auth/2fa/login - "remember this device" (2026-09-16)', () => {
  it('sets a postfly_2fa_remember cookie alongside the session cookie when rememberDevice is true', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword('correct-password') } });
    const secret = await enableTwoFactorFor(user.id, token);

    const loginResponse = await loginRoute(loginRequest(LOGIN_URL, { email: user.email, password: 'correct-password' }));
    const { pendingToken } = await loginResponse.json();

    const response = await twoFactorLoginRoute(
      loginRequest(TWO_FA_LOGIN_URL, { pendingToken, code: computeCode(secret), rememberDevice: true }),
    );
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((cookie) => cookie.startsWith('postfly_token='))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith('postfly_2fa_remember='))).toBe(true);
  });

  it('does NOT set the remember cookie when rememberDevice is omitted/false', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword('correct-password') } });
    const secret = await enableTwoFactorFor(user.id, token);

    const loginResponse = await loginRoute(loginRequest(LOGIN_URL, { email: user.email, password: 'correct-password' }));
    const { pendingToken } = await loginResponse.json();

    const response = await twoFactorLoginRoute(loginRequest(TWO_FA_LOGIN_URL, { pendingToken, code: computeCode(secret) }));
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((cookie) => cookie.startsWith('postfly_2fa_remember='))).toBe(false);
  });
});

describe('POST /api/auth/login - with a trusted-device cookie (2026-09-16)', () => {
  it('skips requiresTwoFactor entirely and issues a real session directly', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword('correct-password') } });
    const secret = await enableTwoFactorFor(user.id, token);

    const firstLogin = await loginRoute(loginRequest(LOGIN_URL, { email: user.email, password: 'correct-password' }));
    const { pendingToken } = await firstLogin.json();
    const twoFaResponse = await twoFactorLoginRoute(
      loginRequest(TWO_FA_LOGIN_URL, { pendingToken, code: computeCode(secret), rememberDevice: true }),
    );
    const rememberCookie = extractCookieValue(twoFaResponse.headers.get('set-cookie'), 'postfly_2fa_remember');

    const secondLogin = await loginRoute(
      loginRequest(LOGIN_URL, { email: user.email, password: 'correct-password' }, {
        Cookie: `postfly_2fa_remember=${rememberCookie}`,
      }),
    );

    expect(secondLogin.status).toBe(200);
    const body = await secondLogin.json();
    expect(body.requiresTwoFactor).toBeUndefined();
    expect(secondLogin.headers.get('set-cookie')).toContain('postfly_token=');
  });

  it('still requires the password even with a valid remember cookie - the cookie never substitutes for it', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword('correct-password') } });
    const secret = await enableTwoFactorFor(user.id, token);

    const firstLogin = await loginRoute(loginRequest(LOGIN_URL, { email: user.email, password: 'correct-password' }));
    const { pendingToken } = await firstLogin.json();
    const twoFaResponse = await twoFactorLoginRoute(
      loginRequest(TWO_FA_LOGIN_URL, { pendingToken, code: computeCode(secret), rememberDevice: true }),
    );
    const rememberCookie = extractCookieValue(twoFaResponse.headers.get('set-cookie'), 'postfly_2fa_remember');

    const wrongPasswordLogin = await loginRoute(
      loginRequest(LOGIN_URL, { email: user.email, password: 'wrong-password' }, {
        Cookie: `postfly_2fa_remember=${rememberCookie}`,
      }),
    );

    expect(wrongPasswordLogin.status).toBe(401);
  });

  it('a garbage/unrecognized remember cookie still requires the 2FA step normally', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword('correct-password') } });
    await enableTwoFactorFor(user.id, token);

    const response = await loginRoute(
      loginRequest(LOGIN_URL, { email: user.email, password: 'correct-password' }, {
        Cookie: 'postfly_2fa_remember=not-a-real-token',
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.requiresTwoFactor).toBe(true);
  });

  it("a device trusted by one user never bypasses 2FA for a different user's account", async () => {
    const { user: userA, token: tokenA } = await createTestUser();
    const { user: userB, token: tokenB } = await createTestUser();
    cleanupUserId = userA.id;

    try {
      await prisma.user.update({ where: { id: userA.id }, data: { passwordHash: hashPassword('password-a') } });
      await prisma.user.update({ where: { id: userB.id }, data: { passwordHash: hashPassword('password-b') } });
      const secretA = await enableTwoFactorFor(userA.id, tokenA);
      await enableTwoFactorFor(userB.id, tokenB);

      const loginA = await loginRoute(loginRequest(LOGIN_URL, { email: userA.email, password: 'password-a' }));
      const { pendingToken: pendingA } = await loginA.json();
      const twoFaA = await twoFactorLoginRoute(
        loginRequest(TWO_FA_LOGIN_URL, { pendingToken: pendingA, code: computeCode(secretA), rememberDevice: true }),
      );
      const rememberCookieForA = extractCookieValue(twoFaA.headers.get('set-cookie'), 'postfly_2fa_remember');

      // Same browser/cookie, but logging in as userB - userA's trusted-device token must not apply.
      const loginBWithAsCookie = await loginRoute(
        loginRequest(LOGIN_URL, { email: userB.email, password: 'password-b' }, {
          Cookie: `postfly_2fa_remember=${rememberCookieForA}`,
        }),
      );
      const bodyB = await loginBWithAsCookie.json();
      expect(bodyB.requiresTwoFactor).toBe(true);
    } finally {
      await deleteTestUser(userB.id);
    }
  });
});
