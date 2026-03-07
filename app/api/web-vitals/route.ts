import { NextRequest, NextResponse } from 'next/server';
import { badRequest, serverError, tooManyRequests } from '@/lib/server/http';
import { consumeRateLimit, getRequestIp } from '@/lib/server/rate-limit';

type WebVitalName = 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB';

const ALLOWED_METRICS = new Set<WebVitalName>(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']);

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const rateLimit = await consumeRateLimit({
      key: `analytics:web-vitals:${ip}`,
      limit: 60,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return tooManyRequests('Too many web-vitals events. Try again later.', rateLimit.retryAfterSec);
    }

    const body = (await request.json()) as {
      id?: string;
      name?: WebVitalName;
      value?: number;
      label?: string;
      rating?: 'good' | 'needs-improvement' | 'poor';
      path?: string;
      navigationType?: string;
      at?: string;
    };

    if (!body.name || !ALLOWED_METRICS.has(body.name)) {
      return badRequest('Validation failed', ['name: Unsupported metric name']);
    }

    if (typeof body.value !== 'number' || !Number.isFinite(body.value)) {
      return badRequest('Validation failed', ['value: Invalid metric value']);
    }

    console.info('[web-vitals]', {
      id: body.id,
      metric: body.name,
      value: body.value,
      rating: body.rating,
      path: body.path,
      navigationType: body.navigationType,
      at: body.at ?? new Date().toISOString(),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
