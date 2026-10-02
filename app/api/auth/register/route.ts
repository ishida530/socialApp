import { NextRequest, NextResponse } from 'next/server';
import { issueAccessToken, TOKEN_COOKIE_NAME, getSessionMaxAgeSec } from '@/lib/server/auth';
import { badRequest, serverError, tooManyRequests } from '@/lib/server/http';
import { hashPassword } from '@/lib/server/crypto';
import { hasTrippedHoneypot } from '@/lib/server/honeypot';
import { prisma } from '@/lib/server/prisma';
import { consumeRateLimit, getRequestIp } from '@/lib/server/rate-limit';
import { sendEmailVerificationEmail } from '@/lib/mail/service';
import { buildEmailVerificationLink } from '@/lib/server/email-verification';
import { isRegistrationOpen } from '@/lib/server/app-mode';


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
      hpWebsite?: string;
      formStartedAt?: number | string;
    };

    if (hasTrippedHoneypot(body)) {
      return badRequest('Validation failed');
    }

    if (!(await isRegistrationOpen())) {
      return badRequest('Rejestracja jest zamknięta w trybie personal — appka jest skonfigurowana dla jednego użytkownika.');
    }

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

    try {
      await sendEmailVerificationEmail(user.email, user.name, buildEmailVerificationLink(user.id, user.email));
    } catch (emailError) {
      console.error('[mail] Verification email sending failed.', emailError);
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
      maxAge: getSessionMaxAgeSec(),
    });

    return response;
  } catch (error) {
    return serverError(error);
  }
}
