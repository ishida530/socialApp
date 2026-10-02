import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

export type AuthUser = {
  userId: string;
  email: string;
};

export const TOKEN_COOKIE_NAME = 'postfly_token';

// 2FA "remember this device" (2026-09-16) - a SEPARATE cookie from the session token above. It
// never grants a session by itself; POST /api/auth/login only ever reads it to decide whether to
// skip straight to a real session instead of returning requiresTwoFactor, and only after the
// password already checked out. See lib/server/two-factor.ts for the token itself.
export const TWO_FACTOR_REMEMBER_COOKIE_NAME = 'postfly_2fa_remember';
export const TWO_FACTOR_REMEMBER_MAX_AGE_SEC = 30 * 24 * 60 * 60;

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Missing required config: JWT_SECRET');
  }

  return secret;
}

// Session length in seconds (2026-10-02): 30 days by default, renewed while the user is active
// (see shouldRenewSession / GET /api/auth/me) - a SaaS session must not end after an hour of work.
// JWT_EXPIRES_IN overrides it. The one definition for the token AND the cookie max-age.
const DEFAULT_SESSION_SECONDS = 30 * 24 * 60 * 60;

export function getSessionMaxAgeSec() {
  const raw = Number(process.env.JWT_EXPIRES_IN);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_SESSION_SECONDS;
}

export function issueAccessToken(userId: string, email: string) {
  return jwt.sign({ sub: userId, email }, requireJwtSecret(), {
    expiresIn: getSessionMaxAgeSec(),
  });
}

// Renew at most once a day: a token issued more than 24 h ago is replaced on the next
// /api/auth/me call (made on every app load), so an active user's session keeps sliding forward.
const SESSION_RENEW_AFTER_SEC = 24 * 60 * 60;

export function shouldRenewSession(token: string) {
  const decoded = jwt.decode(token) as { iat?: number } | null;
  if (!decoded?.iat) {
    return false;
  }
  return Date.now() / 1000 - decoded.iat > SESSION_RENEW_AFTER_SEC;
}

export function verifyAccessToken(token: string): AuthUser {
  let decoded: {
    sub?: string;
    email?: string;
    purpose?: string;
  };

  try {
    decoded = jwt.verify(token, requireJwtSecret()) as {
      sub?: string;
      email?: string;
      purpose?: string;
    };
  } catch {
    throw new Error('Unauthorized');
  }

  if (!decoded.sub || !decoded.email) {
    throw new Error('Unauthorized');
  }

  // EPIC 9 TASK-9.3 (2FA, 2026-09-15): a pending-2FA token (issued after password verification,
  // before the 6-digit code) carries `purpose: '2fa-pending'` and must NEVER be usable as a real
  // session token - without this check it would pass every other requirement above (it has a
  // valid sub/email), letting someone with just the password skip the second factor entirely.
  if (decoded.purpose) {
    throw new Error('Unauthorized');
  }

  return {
    userId: decoded.sub,
    email: decoded.email,
  };
}

const TWO_FACTOR_PENDING_PURPOSE = '2fa-pending';
const TWO_FACTOR_PENDING_EXPIRES_IN_SEC = 5 * 60;

// EPIC 9 TASK-9.3 (2FA, 2026-09-15): issued instead of a real session token when a password check
// succeeds but the account has 2FA enabled - short-lived (5 min), and rejected by
// verifyAccessToken above precisely because it carries `purpose`. Exchanged for a real session via
// POST /api/auth/2fa/login once the user provides a valid code.
export function issuePendingTwoFactorToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email, purpose: TWO_FACTOR_PENDING_PURPOSE }, requireJwtSecret(), {
    expiresIn: TWO_FACTOR_PENDING_EXPIRES_IN_SEC,
  });
}

export function verifyPendingTwoFactorToken(token: string): AuthUser {
  let decoded: { sub?: string; email?: string; purpose?: string };

  try {
    decoded = jwt.verify(token, requireJwtSecret()) as { sub?: string; email?: string; purpose?: string };
  } catch {
    throw new Error('Unauthorized');
  }

  if (!decoded.sub || !decoded.email || decoded.purpose !== TWO_FACTOR_PENDING_PURPOSE) {
    throw new Error('Unauthorized');
  }

  return { userId: decoded.sub, email: decoded.email };
}

function getTokenFromRequest(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    const fromHeader = authorization.replace('Bearer ', '').trim();
    if (fromHeader) {
      return fromHeader;
    }
  }

  return request.cookies.get(TOKEN_COOKIE_NAME)?.value?.trim() || null;
}

export function getAuthUserFromRequest(request: NextRequest): AuthUser {
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Error('Unauthorized');
  }

  return verifyAccessToken(token);
}
