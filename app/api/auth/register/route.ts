import { NextRequest, NextResponse } from 'next/server';
import { issueAccessToken, TOKEN_COOKIE_NAME } from '@/lib/server/auth';
import { badRequest, serverError, tooManyRequests } from '@/lib/server/http';
import { hashPassword } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/prisma';
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
      key: `auth:register:${ip}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return tooManyRequests('Too many registration attempts. Try again later.', rateLimit.retryAfterSec);
    }

    const body = (await request.json()) as {
      email?: string;
      name?: string;
      password?: string;
    };

    if (!body.email || !body.name || !body.password) {
      return badRequest('Validation failed', [
        'email: Email jest wymagany',
        'name: Nazwa jest wymagana',
        'password: Hasło jest wymagane',
      ]);
    }

    const normalizedEmail = body.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return badRequest('User with this email already exists');
    }

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: body.name,
        passwordHash: hashPassword(body.password),
      },
    });

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
