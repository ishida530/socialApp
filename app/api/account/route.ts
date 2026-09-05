import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest, TOKEN_COOKIE_NAME } from '@/lib/server/auth';
import { badRequest, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { prisma } from '@/lib/server/prisma';
import { verifyPassword } from '@/lib/server/crypto';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { resolveBillingMode } from '@/lib/server/billing-mode';
import { getStripeClient } from '@/lib/server/stripe';

export async function DELETE(request: NextRequest) {
  try {
    const authUser = getAuthUserFromRequest(request);

    const rateLimit = await consumeRateLimit({
      key: `account:delete:${authUser.userId}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return tooManyRequests('Too many account deletion attempts. Try again later.', rateLimit.retryAfterSec);
    }

    const body = (await request.json().catch(() => ({}))) as { password?: string };
    if (!body.password) {
      return badRequest('Validation failed', ['password: Hasło jest wymagane do potwierdzenia usunięcia konta']);
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: { id: true, passwordHash: true },
    });

    if (!user?.passwordHash || !verifyPassword(body.password, user.passwordHash)) {
      // 400, not 401: a 401 here would be misread by the client's global axios
      // interceptor as "your session expired" (it hard-redirects to /login on any
      // non-/auth/me 401 outside /login|/register) — this is a wrong confirmation
      // value for an action, not an invalid/expired session, which stays valid here.
      return badRequest('Nieprawidłowe hasło.');
    }

    const subscription = await prisma.subscription.findUnique({
      where: { userId: authUser.userId },
      select: { providerSubscriptionId: true, status: true },
    });

    if (
      resolveBillingMode() === 'live' &&
      subscription?.providerSubscriptionId &&
      subscription.status === 'ACTIVE'
    ) {
      try {
        const stripe = getStripeClient();
        await stripe.subscriptions.cancel(subscription.providerSubscriptionId);
      } catch {
        // If Stripe cancellation fails (e.g. already canceled), proceed with account
        // deletion anyway — an orphaned Stripe subscription is recoverable manually,
        // an account that can never be deleted is not.
      }
    }

    await prisma.user.delete({ where: { id: authUser.userId } });

    const response = NextResponse.json({ success: true });
    response.cookies.set(TOKEN_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
