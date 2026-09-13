import { NextRequest, NextResponse } from 'next/server';
import { unauthorized } from '@/lib/server/http';
import { processPublishJobImmediately } from '@/lib/server/publish-processor';
import { verifyQStashSignature } from '@/lib/server/qstash';
import { logError, logEvent } from '@/lib/server/observability';

// Called by Upstash QStash at (or shortly after) a job's scheduledFor time - see
// lib/server/qstash.ts / lib/server/publish-jobs.ts (enqueueDraftGroup schedules this for every
// non-publishNow job). Same signature-verification-before-anything-else pattern as the Telegram
// webhook: the body is data to act on, never trusted until the signature checks out.
export async function POST(request: NextRequest) {
  const signature = request.headers.get('upstash-signature');
  const bodyText = await request.text();

  const isValid = await verifyQStashSignature(signature, bodyText);
  if (!isValid) {
    return unauthorized('Invalid QStash signature');
  }

  let payload: { jobId?: unknown };
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof payload.jobId !== 'string' || !payload.jobId) {
    return NextResponse.json({ ok: false, error: 'Missing jobId' }, { status: 400 });
  }

  const jobId = payload.jobId;

  try {
    // processPublishJobImmediately only claims a job that is still PENDING and actually due
    // (scheduledFor <= now) - a job canceled/re-scheduled/already handled by the cron fallback
    // in the meantime is a harmless no-op ('skipped'), not an error.
    const outcome = await processPublishJobImmediately(jobId);
    logEvent('qstash', 'trigger-publish-handled', { jobId, outcome });
    return NextResponse.json({ ok: true, jobId, outcome });
  } catch (error) {
    logError('qstash', 'trigger-publish-failed', error, { jobId });
    return NextResponse.json({ ok: false, jobId, error: 'Internal error' }, { status: 500 });
  }
}
