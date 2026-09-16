import { NextRequest, NextResponse } from 'next/server';
import {
  issueAccessToken,
  TOKEN_COOKIE_NAME,
  TWO_FACTOR_REMEMBER_COOKIE_NAME,
  TWO_FACTOR_REMEMBER_MAX_AGE_SEC,
  verifyPendingTwoFactorToken,
} from '@/lib/server/auth';
import { badRequest, tooManyRequests, unauthorized, serverError } from '@/lib/server/http';
import { createTrustedDeviceToken, verifyTwoFactorForLogin } from '@/lib/server/two-factor';
import { recordAuditLog } from '@/lib/server/audit-log';
import { consumeRateLimit, getRequestIp } from '@/lib/server/rate-limit';

function resolveCookieMaxAge() {
  const raw = Number(process.env.JWT_EXPIRES_IN ?? 3600);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 3600;
  }

  return Math.floor(raw);
}

// Step 2 of login for an account with 2FA enabled - exchanges the short-lived pendingToken from
// POST /api/auth/login (issued only after the password already checked out) plus a valid
// TOTP/backup code for a real session cookie.
export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const rateLimit = await consumeRateLimit({ key: `auth:2fa-login:${ip}`, limit: 10, windowMs: 15 * 60 * 1000 });
    if (!rateLimit.allowed) {
      return tooManyRequests('Too many attempts. Try again later.', rateLimit.retryAfterSec);
    }

    const body = (await request.json().catch(() => ({}))) as {
      pendingToken?: string;
      code?: string;
      rememberDevice?: boolean;
    };
    if (!body.pendingToken || !body.code) {
      return badRequest('Validation failed', ['pendingToken i code są wymagane']);
    }

    let pendingUser;
    try {
      pendingUser = verifyPendingTwoFactorToken(body.pendingToken);
    } catch {
      return unauthorized('Sesja logowania wygasła. Zaloguj się ponownie.');
    }

    const verified = await verifyTwoFactorForLogin(pendingUser.userId, body.code);
    if (!verified) {
      await recordAuditLog({ userId: pendingUser.userId, actor: 'user', action: 'login.2fa_code_invalid', ip });
      return unauthorized('Nieprawidłowy kod.');
    }

    await recordAuditLog({ userId: pendingUser.userId, actor: 'user', action: 'login.succeeded', ip, metadata: { via2fa: true } });

    const accessToken = issueAccessToken(pendingUser.userId, pendingUser.email);
    const response = NextResponse.json({ user: { userId: pendingUser.userId, email: pendingUser.email } });

    response.cookies.set(TOKEN_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: resolveCookieMaxAge(),
    });

    // "Remember this device" (2026-09-16) - opt-in, unchecked by default is NOT the case here on
    // purpose (see app/login/page.tsx: the checkbox defaults to checked, matching what the owner
    // asked for - typing a code on every login was the actual complaint). Separate cookie from the
    // session above; losing/expiring this one only ever brings back the 2FA prompt, never logs
    // anyone out.
    if (body.rememberDevice) {
      const rememberToken = await createTrustedDeviceToken(pendingUser.userId);
      response.cookies.set(TWO_FACTOR_REMEMBER_COOKIE_NAME, rememberToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: TWO_FACTOR_REMEMBER_MAX_AGE_SEC,
      });
    }

    return response;
  } catch (error) {
    return serverError(error);
  }
}
