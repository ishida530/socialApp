import { NextRequest, NextResponse } from 'next/server';
import { badRequest, serverError, tooManyRequests } from '@/lib/server/http';
import { consumeRateLimit, getRequestIp } from '@/lib/server/rate-limit';

type LandingEventName =
  | 'landing_view'
  | 'landing_section_view'
  | 'landing_cta_click'
  | 'landing_plan_click';

const ALLOWED_EVENTS = new Set<LandingEventName>([
  'landing_view',
  'landing_section_view',
  'landing_cta_click',
  'landing_plan_click',
]);

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const rateLimit = await consumeRateLimit({
      key: `analytics:landing:${ip}`,
      limit: 120,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return tooManyRequests('Too many analytics events. Try again later.', rateLimit.retryAfterSec);
    }

    const body = (await request.json()) as {
      event?: LandingEventName;
      source?: string;
      section?: string;
      cta?: string;
      plan?: string;
      href?: string;
    };

    if (!body.event || !ALLOWED_EVENTS.has(body.event)) {
      return badRequest('Validation failed', ['event: Unsupported event type']);
    }

    console.info('[landing-event]', {
      event: body.event,
      source: body.source ?? 'landing',
      section: body.section,
      cta: body.cta,
      plan: body.plan,
      href: body.href,
      at: new Date().toISOString(),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
