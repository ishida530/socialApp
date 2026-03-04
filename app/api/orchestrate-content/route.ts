import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit, getRequestIp } from '@/lib/server/rate-limit';
import { assertUsageAllowed, incrementUsage } from '@/lib/server/subscription';
import { orchestrateContent } from '@/lib/server/smart-autopilot/orchestrator';
import { OrchestrationBusinessError } from '@/lib/server/smart-autopilot/types';
import { validateOrchestrateContentInput } from '@/lib/server/smart-autopilot/validation';

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const ip = getRequestIp(request);

    const limiter = await consumeRateLimit({
      key: `orchestrate-content:${user.userId}:${ip}`,
      limit: 25,
      windowMs: 60_000,
    });

    if (!limiter.allowed) {
      return tooManyRequests('Rate limit exceeded for orchestrate-content', limiter.retryAfterSec);
    }

    const body = await request.json();
    const parsed = validateOrchestrateContentInput(body);

    if (!parsed.ok) {
      return badRequest('Validation failed', parsed.errors);
    }

    await assertUsageAllowed(user.userId, 'publish_jobs');

    if (parsed.value.mode === 'ai-autopilot') {
      await assertUsageAllowed(user.userId, 'ai_autopilot_runs');
    }

    const result = await orchestrateContent(user.userId, parsed.value);
    await incrementUsage(user.userId, 'publish_jobs');

    if (parsed.value.mode === 'ai-autopilot') {
      await incrementUsage(user.userId, 'ai_autopilot_runs');
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    if (error instanceof OrchestrationBusinessError) {
      return NextResponse.json(
        {
          code: error.code,
          message: error.message,
        },
        {
          status: error.status,
        },
      );
    }

    if (
      error instanceof Error &&
      error.message.startsWith('Przekroczono limit planu')
    ) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}
