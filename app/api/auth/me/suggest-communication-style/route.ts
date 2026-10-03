import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { suggestCommunicationStyle } from '@/lib/server/communication-style';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { AI_QUOTA_EXHAUSTED_MESSAGE, hasAiGenerationQuota, recordAiGeneration } from '@/lib/server/subscription';

const DRAFT_MAX_LENGTH = 500;

// 2026-09-16 - "Zaproponuj (AI)" button next to the Styl wypowiedzi field on /account. Never
// saves anything itself - returns a suggestion the user reviews/edits, same "AI suggests, human
// approves" pattern as every other AI-assisted flow in this app (weekly plan, content ideas...).
export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);

    // 2026-10-03 (AI gaps): this AI call had neither a rate limit nor a quota.
    const rateLimit = await consumeRateLimit({ key: `auth:suggest-style:${user.userId}`, limit: 10, windowMs: 15 * 60 * 1000 });
    if (!rateLimit.allowed) {
      return tooManyRequests('Too many requests. Try again later.', rateLimit.retryAfterSec);
    }
    if (!(await hasAiGenerationQuota(user.userId))) {
      return NextResponse.json({ message: AI_QUOTA_EXHAUSTED_MESSAGE }, { status: 429 });
    }

    const body = (await request.json().catch(() => ({}))) as { draft?: string };

    if (body.draft !== undefined && typeof body.draft !== 'string') {
      return badRequest('Validation failed', ['draft: wymagany tekst']);
    }
    if (body.draft && body.draft.length > DRAFT_MAX_LENGTH) {
      return badRequest('Validation failed', [`draft: maksymalnie ${DRAFT_MAX_LENGTH} znaków`]);
    }

    const profile = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { businessDescription: true },
    });

    const suggestion = await suggestCommunicationStyle(body.draft ?? null, profile?.businessDescription ?? null);
    if (body.draft?.trim()) {
      await recordAiGeneration(user.userId);
    }

    return NextResponse.json({ suggestion });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
