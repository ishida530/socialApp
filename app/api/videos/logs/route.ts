import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as any;
    const user = getAuthUserFromRequest(request);

    // Log to console (appears in Vercel logs)
    console.log('=== VIDEO_UPLOAD_DEBUG ===', {
      timestamp: new Date().toISOString(),
      userId: user.userId,
      eventType: body.type,
      details: body,
    });

    // For critical errors, also log to stderr for visibility
    if (body.type === 'upload_failed' || body.type === 'error') {
      console.error('=== VIDEO_UPLOAD_ERROR ===', {
        timestamp: new Date().toISOString(),
        userId: user.userId,
        eventType: body.type,
        fileSize: body.fileSize,
        error: body.error,
        attempt: body.attempt,
        totalAttempts: body.totalAttempts,
        duration: body.durationMs,
        retryDelayMs: body.retryDelayMs,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('=== VIDEO_LOGS_ENDPOINT_ERROR ===', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : '',
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
