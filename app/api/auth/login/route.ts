import { NextRequest, NextResponse } from 'next/server';
import { issueAccessToken, issuePendingTwoFactorToken, TOKEN_COOKIE_NAME } from '@/lib/server/auth';
import {
  badRequest,
  serverError,
  tooManyRequests,
  unauthorized,
} from '@/lib/server/http';
import { prisma } from '@/lib/server/prisma';
import { verifyPassword } from '@/lib/server/crypto';
import { hasTrippedHoneypot } from '@/lib/server/honeypot';
import { consumeRateLimit, getRequestIp } from '@/lib/server/rate-limit';
import { recordAuditLog } from '@/lib/server/audit-log';

function resolveCookieMaxAge() {
  const raw = Number(process.env.JWT_EXPIRES_IN ?? 3600);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 3600;
  }

  return Math.floor(raw);
}

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const rateLimit = await consumeRateLimit({
      key: `auth:login:${ip}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return tooManyRequests('Too many login attempts. Try again later.', rateLimit.retryAfterSec);
    }

    const body = (await request.json()) as {
      email?: string;
      password?: string;
      hpWebsite?: string;
    };

    if (!body.email || !body.password) {
      return badRequest('Validation failed', [
        'email: Email jest wymagany',
        'password: Hasło jest wymagane',
      ]);
    }

    const normalizedEmail = body.email.trim().toLowerCase();
    if (!normalizedEmail) {
      return badRequest('Validation failed', ['email: Email jest wymagany']);
    }

    const normalizedHoneypot = body.hpWebsite?.trim().toLowerCase() ?? '';
    const looksLikeEmailAutofill =
      normalizedHoneypot.length > 0 && normalizedHoneypot === normalizedEmail;

    // Keep honeypot for bot traffic, but ignore known mobile autofill pattern.
    if (!looksLikeEmailAutofill && hasTrippedHoneypot({ hpWebsite: body.hpWebsite })) {
      return unauthorized('Invalid credentials');
    }

    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
    });
    if (!user?.passwordHash) {
      return unauthorized('Invalid credentials');
    }

    const isValid = verifyPassword(body.password, user.passwordHash);
    if (!isValid) {
      await recordAuditLog({ userId: user.id, actor: 'user', action: 'login.failed', ip });
      return unauthorized('Invalid credentials');
    }

    // EPIC 9 TASK-9.3 (2FA, 2026-09-15): password alone is not enough for an account with 2FA
    // enabled - issue a short-lived pending token instead of a real session, and make the client
    // collect a code before POST /api/auth/2fa/login actually logs the user in.
    if (user.twoFactorEnabled) {
      const pendingToken = issuePendingTwoFactorToken(user.id, user.email);
      await recordAuditLog({ userId: user.id, actor: 'user', action: 'login.password_ok_2fa_required', ip });
      return NextResponse.json({ requiresTwoFactor: true, pendingToken });
    }

    await recordAuditLog({ userId: user.id, actor: 'user', action: 'login.succeeded', ip });

    const accessToken = issueAccessToken(user.id, user.email);
    const response = NextResponse.json({
      user: {
        userId: user.id,
        email: user.email,
      },
    });

    response.cookies.set(TOKEN_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: resolveCookieMaxAge(),
    });

    return response;
  } catch (error) {
    return serverError(error);
  }
}
