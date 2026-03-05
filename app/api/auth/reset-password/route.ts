import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/server/crypto';
import { badRequest, serverError, tooManyRequests } from '@/lib/server/http';
import { prisma } from '@/lib/server/prisma';
import { consumeRateLimit, getRequestIp } from '@/lib/server/rate-limit';

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const rateLimit = await consumeRateLimit({
      key: `auth:reset-password:${ip}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return tooManyRequests('Too many password reset attempts. Try again later.', rateLimit.retryAfterSec);
    }

    const body = (await request.json()) as {
      token?: string;
      password?: string;
    };

    if (!body.token || !body.password) {
      return badRequest('Validation failed', [
        'token: Token resetu hasla jest wymagany',
        'password: Haslo jest wymagane',
      ]);
    }

    if (body.password.length < MIN_PASSWORD_LENGTH) {
      return badRequest('Validation failed', [
        `password: Haslo musi miec co najmniej ${MIN_PASSWORD_LENGTH} znakow`,
      ]);
    }

    const tokenHash = createHash('sha256').update(body.token).digest('hex');

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        usedAt: true,
        expiresAt: true,
      },
    });

    const now = new Date();
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now) {
      return badRequest('Token resetu hasla jest nieprawidlowy lub wygasl.');
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: hashPassword(body.password) },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now },
      }),
      prisma.passwordResetToken.deleteMany({
        where: {
          userId: resetToken.userId,
          id: { not: resetToken.id },
        },
      }),
    ]);

    return NextResponse.json({ message: 'Haslo zostalo zresetowane.' });
  } catch (error) {
    return serverError(error);
  }
}
