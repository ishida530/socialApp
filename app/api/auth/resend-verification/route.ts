import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { prisma } from '@/lib/server/prisma';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { sendEmailVerificationEmail } from '@/lib/mail/service';
import { buildEmailVerificationLink } from '@/lib/server/email-verification';

// "Wyślij ponownie" in the verification banner.
export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = getAuthUserFromRequest(request).userId;
  } catch {
    return unauthorized();
  }

  try {
    const rateLimit = await consumeRateLimit({ key: `auth:resend-verification:${userId}`, limit: 3, windowMs: 60 * 60 * 1000 });
    if (!rateLimit.allowed) {
      return tooManyRequests('Za często - spróbuj ponownie za godzinę.', rateLimit.retryAfterSec);
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, emailVerifiedAt: true } });
    if (!user) {
      return unauthorized();
    }
    if (user.emailVerifiedAt) {
      return badRequest('Adres e-mail jest już potwierdzony.');
    }

    await sendEmailVerificationEmail(user.email, user.name, buildEmailVerificationLink(userId, user.email));
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError(error);
  }
}
