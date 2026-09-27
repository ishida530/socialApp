// "Sprawdź komentarze teraz" (2026-09-27): on-demand version of the daily comment sweep, limited to
// the caller's own published posts. Rate-limited so a user can't burn the Meta API rate limits by
// clicking repeatedly.
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { detectAndNotifyNewComments } from '@/lib/server/social-comments';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = getAuthUserFromRequest(request).userId;
  } catch {
    return unauthorized();
  }

  try {
    const rateLimit = await consumeRateLimit({
      key: `comments:refresh:${userId}`,
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return tooManyRequests('Too many comment refreshes. Try again later.', rateLimit.retryAfterSec);
    }

    const result = await detectAndNotifyNewComments({ userId });
    return NextResponse.json(result);
  } catch (error) {
    return serverError(error);
  }
}
