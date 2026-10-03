import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, notFound, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { generatePlatformBundles, previewImageUrls } from '@/lib/server/composer-drafts';
import { aiQuotaDeniedMessage } from '@/lib/server/subscription';
import { collectContentWarnings } from '@/lib/server/content-safety';
import { PUBLIC_SOCIAL_ACCOUNT_SELECT } from '@/lib/server/public-fields';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getAuthUserFromRequest(request);

    const rateLimit = await consumeRateLimit({
      key: `publish-jobs:drafts-regenerate:${user.userId}`,
      limit: 15,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return tooManyRequests('Too many requests. Try again later.', rateLimit.retryAfterSec);
    }

    const params = await context.params;
    const body = (await request.json()) as { rawInput?: string; timezone?: string };

    const job = await prisma.publishJob.findFirst({
      where: {
        id: params.id,
        status: 'DRAFT',
        video: { userId: user.userId },
      },
      include: { video: true, socialAccount: { select: PUBLIC_SOCIAL_ACCOUNT_SELECT } },
    });

    if (!job) {
      return notFound('Nie znaleziono niedokończonego posta dla tej platformy.');
    }

    const { bundlesByPlatform, orchestrationWarning, aiGenerated, aiUnavailableReason } = await generatePlatformBundles(user.userId, {
      // 2026-10-02 (AI review): start from the user's original note, not the current caption, and
      // pass the current caption as the version to move away from - otherwise the model mostly
      // paraphrased its own previous output.
      rawInput: body.rawInput?.trim() || job.sourceNote || job.caption,
      previousCaption: job.caption || undefined,
      imageUrls: previewImageUrls(job.video),
      targetPlatforms: [job.socialAccount.platform],
      timezone: body.timezone || 'Europe/Warsaw',
      idempotencyKey: `${job.postGroupId}-regenerate-${job.socialAccount.platform}-${Date.now()}`,
    });

    const bundle = bundlesByPlatform.get(job.socialAccount.platform);
    if (!bundle) {
      return badRequest(orchestrationWarning || 'Nie udało się wygenerować nowej treści.');
    }

    // 2026-10-02: "Wygeneruj ponownie" asks for a NEW text from the AI. When Claude is unavailable
    // the template fallback would just prefix the current caption again ("Krótka aktualizacja:
    // Krótka aktualizacja: ..."), so keep the draft unchanged and say what happened instead.
    if (!aiGenerated && aiUnavailableReason === 'quota') {
      return NextResponse.json({ message: await aiQuotaDeniedMessage(user.userId) }, { status: 429 });
    }
    if (!aiGenerated) {
      return NextResponse.json(
        { message: 'Generator AI jest chwilowo niedostępny. Opis nie został zmieniony - spróbuj ponownie później.' },
        { status: 503 },
      );
    }

    const updated = await prisma.publishJob.update({
      where: { id: job.id },
      data: {
        caption: bundle.caption,
        hashtags: bundle.hashtags,
        title: bundle.title ?? null,
        aiCaption: bundle.caption,
        contentWarnings: collectContentWarnings(bundle.caption, job.socialAccount.platform),
      },
      include: { video: true, socialAccount: { select: PUBLIC_SOCIAL_ACCOUNT_SELECT } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
