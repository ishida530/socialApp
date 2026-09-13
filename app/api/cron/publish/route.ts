import { NextRequest, NextResponse } from 'next/server';
import { processDuePublishJobs } from '@/lib/server/publish-processor';
import { serverError, unauthorized } from '@/lib/server/http';
import { runWithRequestId } from '@/lib/server/request-context';

export const dynamic = 'force-dynamic';

function isAuthorizedCronRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('Missing required config: CRON_SECRET');
  }

  const authorization = request.headers.get('authorization');
  return authorization === `Bearer ${secret}`;
}

function resolveBatchSize(request: NextRequest) {
  const batchParam = request.nextUrl.searchParams.get('batch');
  if (!batchParam) {
    return 20;
  }

  const parsed = Number(batchParam);
  if (!Number.isFinite(parsed)) {
    return 20;
  }

  return Math.min(100, Math.max(1, Math.floor(parsed)));
}

// TASK-1.3.4: one requestId per cron sweep, so every job's log lines from this batch can be
// correlated back to the sweep that claimed them - see lib/server/request-context.ts.
export async function GET(request: NextRequest) {
  return runWithRequestId(() => handleGet(request));
}

async function handleGet(request: NextRequest) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return unauthorized('Invalid cron secret');
    }

    const batchSize = resolveBatchSize(request);
    const summary = await processDuePublishJobs(batchSize);

    return NextResponse.json({
      ok: true,
      batchSize,
      summary,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Missing required config: CRON_SECRET') {
      return serverError(error);
    }

    return serverError(error);
  }
}