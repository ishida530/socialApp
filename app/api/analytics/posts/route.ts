import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { collectMetricsForUser, getRecentPostResults } from '@/lib/server/post-metrics';
import { consumeRateLimit } from '@/lib/server/rate-limit';

// Results of the user's own published posts (2026-10-04, Analytics screen).
export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    return NextResponse.json({ posts: await getRecentPostResults(user.userId) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }
    return serverError(error);
  }
}

// "Odśwież statystyki": fetch the current statistics now instead of waiting for the daily sweep.
// Rate-limited - every call hits the platform APIs.
export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const rateLimit = await consumeRateLimit({ key: `analytics:refresh:${user.userId}`, limit: 5, windowMs: 15 * 60 * 1000 });
    if (!rateLimit.allowed) {
      return tooManyRequests('Statystyki odświeżysz ponownie za kilka minut.', rateLimit.retryAfterSec);
    }

    await collectMetricsForUser(user.userId);
    return NextResponse.json({ posts: await getRecentPostResults(user.userId) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }
    return serverError(error);
  }
}
