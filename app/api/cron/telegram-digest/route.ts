import { NextRequest, NextResponse } from 'next/server';
import { sendInactivityNudges, sendMorningDigest } from '@/lib/server/telegram-notifications';
import { collectMetricsForRecentJobs } from '@/lib/server/post-metrics';
import { serverError, unauthorized } from '@/lib/server/http';
import { runWithRequestId } from '@/lib/server/request-context';

export const dynamic = 'force-dynamic';

// Same auth pattern as app/api/cron/publish - a shared Vercel Cron secret, not a per-user token.
function isAuthorizedCronRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('Missing required config: CRON_SECRET');
  }

  const authorization = request.headers.get('authorization');
  return authorization === `Bearer ${secret}`;
}

// One daily sweep covering three related, non-urgent background jobs - the morning digest
// (TASK-3.2.2), the long-inactivity nudge (TASK-3.2.3), and post-performance metrics collection.
// Kept on one route/cron entry deliberately: free-tier Vercel cron slots are limited, and none of
// these are urgent enough to need their own schedule.
//
// TASK-1.3.4: one requestId per sweep - see lib/server/request-context.ts.
export async function GET(request: NextRequest) {
  return runWithRequestId(() => handleGet(request));
}

async function handleGet(request: NextRequest) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return unauthorized('Invalid cron secret');
    }

    const digestSummary = await sendMorningDigest();
    // TASK-3.2.3: same daily sweep, not a separate cron entry - see lib/server/telegram-notifications.ts.
    const inactivitySummary = await sendInactivityNudges();
    // Same daily sweep, not a separate cron entry - see lib/server/post-metrics.ts.
    const metricsSummary = await collectMetricsForRecentJobs();

    return NextResponse.json({
      ok: true,
      ...digestSummary,
      inactivityNudgesSent: inactivitySummary.usersNotified,
      metricsUpdated: metricsSummary.updated,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    return serverError(error);
  }
}
