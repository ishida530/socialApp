import { NextRequest, NextResponse } from 'next/server';
import { sendMorningDigest } from '@/lib/server/telegram-notifications';
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

// TASK-3.2.2: one requestId per digest sweep - see lib/server/request-context.ts.
export async function GET(request: NextRequest) {
  return runWithRequestId(() => handleGet(request));
}

async function handleGet(request: NextRequest) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return unauthorized('Invalid cron secret');
    }

    const summary = await sendMorningDigest();

    return NextResponse.json({
      ok: true,
      ...summary,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    return serverError(error);
  }
}
