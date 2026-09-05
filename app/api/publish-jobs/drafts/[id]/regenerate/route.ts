import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, notFound, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { generatePlatformBundles } from '@/lib/server/composer-drafts';
import { collectContentWarnings } from '@/lib/server/content-safety';

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
      include: { video: true, socialAccount: true },
    });

    if (!job) {
      return notFound('Nie znaleziono niedokończonego posta dla tej platformy.');
    }

    const { bundlesByPlatform, orchestrationWarning } = await generatePlatformBundles(user.userId, {
      rawInput: body.rawInput?.trim() || job.caption,
      targetPlatforms: [job.socialAccount.platform],
      timezone: body.timezone || 'Europe/Warsaw',
      idempotencyKey: `${job.postGroupId}-regenerate-${job.socialAccount.platform}-${Date.now()}`,
    });

    const bundle = bundlesByPlatform.get(job.socialAccount.platform);
    if (!bundle) {
      return badRequest(orchestrationWarning || 'Nie udało się wygenerować nowej treści.');
    }

    const updated = await prisma.publishJob.update({
      where: { id: job.id },
      data: {
        caption: bundle.caption,
        hashtags: bundle.hashtags,
        title: bundle.title ?? null,
        contentWarnings: collectContentWarnings(bundle.caption, job.socialAccount.platform),
      },
      include: { video: true, socialAccount: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
