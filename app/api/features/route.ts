import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { unauthorized } from '@/lib/server/http';
import { commentsFeatureEnabledFor, platformsInReviewFor } from '@/lib/server/platform-availability';

// What this user can use right now (2026-10-02): platforms still waiting for their review and
// whether comment replies are on. Read by the UI to show "wkrótce" states; the same rules are
// enforced server-side (auth-url, comments). Prefetched for every authenticated page.
export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    return NextResponse.json({
      platformsInReview: platformsInReviewFor(user.email),
      commentsEnabled: commentsFeatureEnabledFor(user.email),
    });
  } catch {
    return unauthorized();
  }
}
