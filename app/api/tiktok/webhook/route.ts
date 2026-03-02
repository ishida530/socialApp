import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { logError, logEvent } from '@/lib/server/observability';
import { tooManyRequests } from '@/lib/server/http';
import { consumeRateLimit, getRequestIp } from '@/lib/server/rate-limit';

function verifyWebhookSignature(request: NextRequest, rawBody: string) {
  const secret = process.env.TIKTOK_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('Missing required config: TIKTOK_WEBHOOK_SECRET');
  }

  const signature =
    request.headers.get('x-tiktok-signature') ??
    request.headers.get('tiktok-signature');

  if (!signature) {
    return false;
  }

  const digestHex = createHmac('sha256', secret).update(rawBody).digest('hex');
  const digestBase64 = Buffer.from(digestHex, 'hex').toString('base64');

  const providedSignature = signature.trim();

  const candidates = [digestHex, digestBase64];

  for (const candidate of candidates) {
    const expected = Buffer.from(candidate, 'utf8');
    const provided = Buffer.from(providedSignature, 'utf8');

    if (expected.length !== provided.length) {
      continue;
    }

    if (timingSafeEqual(expected, provided)) {
      return true;
    }
  }

  return false;
}

export async function GET(request: NextRequest) {
  const challenge =
    request.nextUrl.searchParams.get('challenge') ??
    request.nextUrl.searchParams.get('challenge_code');

  if (challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  let payload: unknown = null;

  try {
    const ip = getRequestIp(request);
    const rateLimit = await consumeRateLimit({
      key: `webhook:tiktok:${ip}`,
      limit: 120,
      windowMs: 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return tooManyRequests('Too many webhook requests.', rateLimit.retryAfterSec);
    }

    const rawBody = await request.text();
    const verified = verifyWebhookSignature(request, rawBody);

    if (!verified) {
      logEvent('tiktok-webhook', 'signature-rejected', {
        hasSignatureHeader:
          !!request.headers.get('x-tiktok-signature') ||
          !!request.headers.get('tiktok-signature'),
      });
      return NextResponse.json(
        { message: 'Invalid webhook signature' },
        { status: 401 },
      );
    }

    payload = rawBody ? (JSON.parse(rawBody) as unknown) : null;
    logEvent('tiktok-webhook', 'accepted', {
      payloadPresent: !!payload,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Missing required config: TIKTOK_WEBHOOK_SECRET'
    ) {
      logError('tiktok-webhook', 'missing-secret', error);
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    logError('tiktok-webhook', 'invalid-payload', error);

    return NextResponse.json({ message: 'Invalid webhook payload' }, { status: 400 });
  }

  return NextResponse.json({ received: true });
}
