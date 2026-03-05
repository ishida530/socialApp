import { createHash, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sendPasswordResetEmail } from '@/lib/mail/service';
import { badRequest, serverError, tooManyRequests } from '@/lib/server/http';
import { prisma } from '@/lib/server/prisma';
import { consumeRateLimit, getRequestIp } from '@/lib/server/rate-limit';

function resolveFrontendUrl() {
  return process.env.FRONTEND_URL ?? 'http://localhost:3000';
}

function resolveResetTtlMinutes() {
  const raw = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MIN ?? 30);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 30;
  }

  return Math.floor(raw);
}

function genericSuccessResponse() {
  return NextResponse.json({
    message: 'Jesli konto istnieje, wyslalismy wiadomosc e-mail z instrukcja resetu hasla.',
  });
}

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const rateLimit = await consumeRateLimit({
      key: `auth:forgot-password:${ip}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return tooManyRequests('Too many password reset attempts. Try again later.', rateLimit.retryAfterSec);
    }

    const body = (await request.json()) as { email?: string };

    if (!body.email) {
      return badRequest('Validation failed', ['email: Email jest wymagany']);
    }

    const normalizedEmail = body.email.trim().toLowerCase();
    if (!normalizedEmail) {
      return badRequest('Validation failed', ['email: Email jest wymagany']);
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!user?.passwordHash) {
      return genericSuccessResponse();
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const ttlMinutes = resolveResetTtlMinutes();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const createdToken = await prisma.passwordResetToken.create({
      data: {
        tokenHash,
        expiresAt,
        userId: user.id,
      },
    });

    const resetUrl = new URL('/reset-password', resolveFrontendUrl());
    resetUrl.searchParams.set('token', token);

    try {
      await sendPasswordResetEmail(user.email, resetUrl.toString());
    } catch (emailError) {
      await prisma.passwordResetToken
        .delete({
          where: { id: createdToken.id },
        })
        .catch(() => {
          // Ignore cleanup errors and keep generic response shape.
        });
      console.error('[mail] Password reset email sending failed.', emailError);
    }

    return genericSuccessResponse();
  } catch (error) {
    return serverError(error);
  }
}
