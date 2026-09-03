import { NextRequest, NextResponse } from 'next/server';
import { refreshAllExpiringTokens } from '@/lib/server/social-oauth';
import { serverError, unauthorized } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

function isAuthorizedCronRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('Missing required config: CRON_SECRET');
  }

  const authorization = request.headers.get('authorization');
  return authorization === `Bearer ${secret}`;
}

function resolveHoursAhead(request: NextRequest) {
  const hoursParam = request.nextUrl.searchParams.get('hours');
  if (!hoursParam) {
    return 24;
  }

  const parsed = Number(hoursParam);
  if (!Number.isFinite(parsed)) {
    return 24;
  }

  return Math.min(168, Math.max(1, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return unauthorized('Invalid cron secret');
    }

    const hoursAhead = resolveHoursAhead(request);
    const summary = await refreshAllExpiringTokens(hoursAhead);

    return NextResponse.json({
      ok: true,
      hoursAhead,
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
