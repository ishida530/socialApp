import { NextRequest, NextResponse } from 'next/server';
import { issueAccessToken, TOKEN_COOKIE_NAME } from '@/lib/server/auth';
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

    // Login keeps honeypot protection, but only hidden-field signal is enforced.
    // Timing-based checks are skipped to avoid mobile autofill false positives.
    if (hasTrippedHoneypot({ hpWebsite: body.hpWebsite })) {
      return unauthorized('Invalid credentials');
    }

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
      return unauthorized('Invalid credentials');
    }

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
