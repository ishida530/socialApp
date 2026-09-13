import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { triggerPublishJob } from '@/lib/server/publish-jobs';

// TASK-3.1.2 (decyzja PO 2026-09-13, "zostaw jak jest"): triggerPublishJob publikuje
// synchronicznie w tym samym request/response, co dla wolnego protokołu (np. 3-etapowy upload
// Facebook Reels) może zbliżyć się do domyślnego limitu czasu funkcji Vercela - tani margines
// bezpieczeństwa bez przebudowy na kolejkę, ten sam wzorzec co app/api/videos/upload/route.ts.
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = getAuthUserFromRequest(request);

    const rateLimit = await consumeRateLimit({
      key: `publish-jobs:trigger:${user.userId}`,
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return tooManyRequests('Too many requests. Try again later.', rateLimit.retryAfterSec);
    }

    const params = await context.params;
    const result = await triggerPublishJob(user.userId, params.id);

    if (!result.ok) {
      return badRequest(result.error);
    }

    return NextResponse.json({
      success: true,
      publishJob: result.publishJob,
      immediateOutcome: result.immediateOutcome,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
