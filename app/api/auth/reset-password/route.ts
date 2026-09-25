import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/server/crypto';
import { logEvent } from '@/lib/server/observability';
import { badRequest, serverError, tooManyRequests } from '@/lib/server/http';
import { prisma } from '@/lib/server/prisma';
import { consumeRateLimit, getRequestIp } from '@/lib/server/rate-limit';
import { recordAuditLog } from '@/lib/server/audit-log';

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
      hpWebsite?: string;
      formStartedAt?: number | string;
    };

    // No honeypot here (2026-09-25): the form has no username field, so password managers fill the
    // saved login into the hidden hpWebsite field and real users got "token invalid" on a valid
    // token (seen on an admin-created account's first set-password). The endpoint is useless to a
    // bot anyway without a valid 256-bit token, and the IP rate limit above still applies.

    if (!body.token || !body.password) {
      return badRequest('Validation failed', [
        'token: Token resetu hasła jest wymagany',
        'password: Hasło jest wymagane',
      ]);
    }

    if (body.password.length < MIN_PASSWORD_LENGTH) {
      return badRequest('Validation failed', [
        `password: Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`,
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
      const reason = !resetToken ? 'not-found' : resetToken.usedAt ? 'already-used' : 'expired';
      logEvent('auth', 'reset-password-rejected', { reason });
      return badRequest('Token resetu hasła jest nieprawidłowy lub wygasł.');
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

    await recordAuditLog({ userId: resetToken.userId, actor: 'user', action: 'password.reset', ip });

    return NextResponse.json({ message: 'Hasło zostało zresetowane.' });
  } catch (error) {
    return serverError(error);
  }
}
