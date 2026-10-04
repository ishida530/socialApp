import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { collectAccountGrowthForUser, getFollowerGrowth } from '@/lib/server/account-growth';
import { consumeRateLimit } from '@/lib/server/rate-limit';

// Web equivalent of the Telegram /followers command.
export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const growth = await getFollowerGrowth(user.userId);
    return NextResponse.json({ growth });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}

// "Odśwież teraz" (2026-10-04): fetch the current follower counts of the user's own accounts now
// instead of waiting for the daily sweep. Rate-limited - every call hits the platform APIs.
export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const rateLimit = await consumeRateLimit({ key: `growth:refresh:${user.userId}`, limit: 5, windowMs: 15 * 60 * 1000 });
    if (!rateLimit.allowed) {
      return tooManyRequests('Dane odświeżysz ponownie za kilka minut.', rateLimit.retryAfterSec);
    }

    await collectAccountGrowthForUser(user.userId);
    const growth = await getFollowerGrowth(user.userId);
    return NextResponse.json({ growth });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
