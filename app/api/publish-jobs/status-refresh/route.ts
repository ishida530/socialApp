import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { processPublishJobImmediately } from '@/lib/server/publish-processor';

// TikTok guideline 5e ("poll the publish/status/fetch API ... so users can understand the status
// of their posts"), 2026-09-30. A TikTok publish is two-step: init, then status checks every ~60s.
// Those checks are scheduled via QStash when it's configured, otherwise they'd wait for the daily
// cron - so the composer's status screen calls this while it's open, and every due status check of
// the user's own post group runs right away. processPublishJobImmediately claims atomically
// (PENDING + due -> RUNNING), so this is safe alongside QStash/cron doing the same.
export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);

    const rateLimit = await consumeRateLimit({
      key: `publish-jobs:status-refresh:${user.userId}`,
      limit: 60,
      windowMs: 5 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return tooManyRequests('Too many requests. Try again later.', rateLimit.retryAfterSec);
    }

    const body = (await request.json().catch(() => ({}))) as { postGroupId?: string };
    if (!body.postGroupId) {
      return badRequest('postGroupId jest wymagany');
    }

    const dueStatusChecks = await prisma.publishJob.findMany({
      where: {
        postGroupId: body.postGroupId,
        status: 'PENDING',
        scheduledFor: { lte: new Date() },
        errorMessage: { contains: 'tiktok-tracking:' },
        video: { userId: user.userId },
      },
      select: { id: true },
    });

    for (const job of dueStatusChecks) {
      await processPublishJobImmediately(job.id);
    }

    return NextResponse.json({ processed: dueStatusChecks.length });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
