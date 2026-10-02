import { afterEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

// 2026-10-02: email verification gates the 7-day PRO trial; sessions last 30 days and slide.

const mockSendVerification = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/mail/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mail/service')>()),
  sendEmailVerificationEmail: (...args: unknown[]) => mockSendVerification(...args),
}));

const { POST: register } = await import('@/app/api/auth/register/route');
const { GET: verifyEmail } = await import('@/app/api/auth/verify-email/route');
const { POST: resend } = await import('@/app/api/auth/resend-verification/route');
const { GET: me } = await import('@/app/api/auth/me/route');
const { issueEmailVerificationToken } = await import('@/lib/server/email-verification');
const { getEffectivePlan } = await import('@/lib/server/subscription');
const { issueAccessToken, verifyAccessToken, getSessionMaxAgeSec, TOKEN_COOKIE_NAME } = await import('@/lib/server/auth');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, authHeaders } = await import('../helpers/fixtures');

const cleanup: string[] = [];
const savedMode = process.env.APP_MODE;

afterEach(async () => {
  mockSendVerification.mockClear();
  process.env.APP_MODE = savedMode;
  for (const id of cleanup.splice(0)) await deleteTestUser(id);
});

describe('registration -> verification -> trial', () => {
  it('a new account starts unverified on FREE, gets a verification email, and the link unlocks the trial', async () => {
    process.env.APP_MODE = 'commercial'; // registration open, plan logic active
    const email = `verify-${Date.now()}@example.com`;
    const response = await register(
      new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.9.${Date.now() % 250}.1` },
        body: JSON.stringify({ email, name: 'Nowy', password: 'bezpieczne-haslo-123', formStartedAt: Date.now() - 10_000 }),
      }),
    );
    expect(response.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    cleanup.push(user.id);

    expect(user.emailVerifiedAt).toBeNull();
    expect(await getEffectivePlan(user.id)).toBe('FREE');
    expect(mockSendVerification).toHaveBeenCalledWith(email, 'Nowy', expect.stringContaining('/api/auth/verify-email?token='));

    const link = new URL(mockSendVerification.mock.calls[0][2] as string);
    const redirect = await verifyEmail(new NextRequest(`http://localhost:3000${link.pathname}${link.search}`));
    expect(redirect.headers.get('location')).toContain('emailVerified=1');

    const verified = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(verified.emailVerifiedAt).not.toBeNull();
    expect(await getEffectivePlan(user.id)).toBe('PRO');
  });

  it('rejects tampered tokens, tokens for a changed address, and session tokens', async () => {
    const { user, token } = await createTestUser({ emailVerifiedAt: null });
    cleanup.push(user.id);

    for (const bad of [
      `${issueEmailVerificationToken(user.id, user.email)}x`,
      issueEmailVerificationToken(user.id, 'someone-else@example.com'),
      token, // a session token is not a verification token
    ]) {
      const redirect = await verifyEmail(new NextRequest(`http://localhost:3000/api/auth/verify-email?token=${bad}`));
      expect(redirect.headers.get('location')).toContain('emailVerified=invalid');
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
  });

  it('a verification token can never be used as a session', () => {
    const verificationToken = issueEmailVerificationToken('user-1', 'a@example.com');
    expect(() => verifyAccessToken(verificationToken)).toThrow('Unauthorized');
  });

  it('resend: sends a new link to an unverified account, refuses an already verified one', async () => {
    const unverified = await createTestUser({ emailVerifiedAt: null });
    const verified = await createTestUser();
    cleanup.push(unverified.user.id, verified.user.id);
    const call = (token: string) =>
      resend(new NextRequest('http://localhost:3000/api/auth/resend-verification', { method: 'POST', headers: authHeaders(token) }));

    expect((await call(unverified.token)).status).toBe(200);
    expect(mockSendVerification).toHaveBeenCalledTimes(1);
    expect((await call(verified.token)).status).toBe(400);
  });
});

describe('session length', () => {
  it('defaults to 30 days and the token carries it', () => {
    const saved = process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_EXPIRES_IN;
    try {
      expect(getSessionMaxAgeSec()).toBe(30 * 24 * 60 * 60);
      const decoded = jwt.decode(issueAccessToken('u', 'u@example.com')) as { iat: number; exp: number };
      expect(decoded.exp - decoded.iat).toBe(30 * 24 * 60 * 60);
    } finally {
      process.env.JWT_EXPIRES_IN = saved;
    }
  });

  it('/api/auth/me renews a token older than a day, and leaves a fresh one alone', async () => {
    const { user, token: freshToken } = await createTestUser();
    cleanup.push(user.id);
    const oldToken = jwt.sign(
      { sub: user.id, email: user.email, iat: Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60 },
      process.env.JWT_SECRET as string,
      { expiresIn: '20d' },
    );
    const cookieRequest = (token: string) =>
      new NextRequest('http://localhost:3000/api/auth/me', { headers: { cookie: `${TOKEN_COOKIE_NAME}=${token}` } });

    const renewed = await me(cookieRequest(oldToken));
    expect(renewed.status).toBe(200);
    const newToken = renewed.cookies.get(TOKEN_COOKIE_NAME)?.value;
    expect(newToken).toBeTruthy();
    expect(verifyAccessToken(newToken as string).userId).toBe(user.id);

    const fresh = await me(cookieRequest(freshToken));
    expect(fresh.cookies.get(TOKEN_COOKIE_NAME)).toBeUndefined();
  });
});
