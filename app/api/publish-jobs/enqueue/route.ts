import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { enqueueDraftGroup } from '@/lib/server/publish-jobs';

/**
 * Krok 4 ("Gdzie i kiedy") finalizuje istniejące DRAFT-y utworzone przez
 * POST /api/publish-jobs/drafts (Krok 1→2). Nie tworzy nowych PublishJob-ów
 * od zera — przełącza wybrane DRAFT-y na PENDING, a odznaczone kasuje.
 *
 * Rdzeń logiki żyje w lib/server/publish-jobs.ts (enqueueDraftGroup), żeby przycisk
 * "Publikuj" w Telegramie (TASK-3.1.2) wołał dokładnie tę samą logikę biznesową, nie kopię.
 */
export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);

    const rateLimit = await consumeRateLimit({
      key: `publish-jobs:enqueue:${user.userId}`,
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return tooManyRequests('Too many requests. Try again later.', rateLimit.retryAfterSec);
    }

    const body = (await request.json()) as {
      postGroupId?: string;
      scheduledDate?: string;
      publishNow?: boolean;
      tiktokPostingConsent?: boolean;
      targetPlatforms?: string[];
    };

    if (!body.postGroupId) {
      return badRequest('Validation failed', ['postGroupId: postGroupId jest wymagany']);
    }

    const result = await enqueueDraftGroup(user.userId, {
      postGroupId: body.postGroupId,
      scheduledDate: body.scheduledDate,
      publishNow: body.publishNow,
      tiktokPostingConsent: body.tiktokPostingConsent,
      targetPlatforms: body.targetPlatforms ?? [],
    });

    if (!result.ok) {
      // Dwa konkretne przypadki brakującego/pustego pola wejściowego zachowują format
      // { errors: [...] } zgodny z dotychczasowym API (tests/api/enqueue-publish-job.test.ts) -
      // reszta błędów z enqueueDraftGroup to zwykłe komunikaty biznesowe (message-only),
      // czytelne wprost jako odpowiedź bota na Telegramie bez dodatkowego mapowania.
      if (result.error === 'scheduledDate jest wymagany') {
        return badRequest('Validation failed', ['scheduledDate: scheduledDate jest wymagany']);
      }
      if (result.error === 'wymagane co najmniej 1 platforma') {
        return badRequest('Validation failed', ['targetPlatforms: wymagane co najmniej 1 platforma']);
      }
      return badRequest(result.error);
    }

    const firstJob = result.publishJobs[0];
    const delay = firstJob ? Math.max(0, firstJob.scheduledFor.getTime() - Date.now()) : 0;

    return NextResponse.json({
      success: true,
      publishJob: firstJob ?? null,
      publishJobs: result.publishJobs,
      targetsCount: result.targetsCount,
      immediateOutcome: result.immediateOutcome,
      queue: {
        name: 'next-inline-queue',
        delay,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    if (error instanceof Error && error.message === 'Nieobsługiwana platforma') {
      return badRequest(error.message);
    }

    if (
      error instanceof Error &&
      (error.message.startsWith('Przekroczono limit planu') ||
        error.message.startsWith('Plan FREE pozwala planować publikacje'))
    ) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}
