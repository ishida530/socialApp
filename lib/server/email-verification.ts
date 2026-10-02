import jwt from 'jsonwebtoken';
import { prisma } from './prisma';
import { getFrontendUrl } from './social-oauth';

// Email verification links (2026-10-02). A signed, purpose-bound JWT (never usable as a session:
// verifyAccessToken rejects any token carrying `purpose`) that expires after 3 days.
const PURPOSE = 'email-verify';
const TTL_SEC = 3 * 24 * 60 * 60;

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) {
    throw new Error('Missing required config: JWT_SECRET');
  }
  return value;
}

export function issueEmailVerificationToken(userId: string, email: string) {
  return jwt.sign({ sub: userId, email, purpose: PURPOSE }, secret(), { expiresIn: TTL_SEC });
}

export function buildEmailVerificationLink(userId: string, email: string) {
  const url = new URL('/api/auth/verify-email', getFrontendUrl());
  url.searchParams.set('token', issueEmailVerificationToken(userId, email));
  return url.toString();
}

// Marks the address verified if the token is valid and still matches the account's email.
export async function verifyEmailToken(token: string): Promise<{ ok: true; userId: string } | { ok: false }> {
  let decoded: { sub?: string; email?: string; purpose?: string };
  try {
    decoded = jwt.verify(token, secret()) as typeof decoded;
  } catch {
    return { ok: false };
  }

  if (decoded.purpose !== PURPOSE || !decoded.sub || !decoded.email) {
    return { ok: false };
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.sub }, select: { email: true, emailVerifiedAt: true } });
  if (!user || user.email !== decoded.email) {
    return { ok: false };
  }

  if (!user.emailVerifiedAt) {
    await prisma.user.update({ where: { id: decoded.sub }, data: { emailVerifiedAt: new Date() } });
  }
  return { ok: true, userId: decoded.sub };
}
