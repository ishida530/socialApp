import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import {
  assertScheduleWindowAllowed,
  assertUsageAllowed,
  getSubscriptionSnapshot,
  incrementUsage,
} from '@/lib/server/subscription';
import { processPublishJobImmediately } from '@/lib/server/publish-processor';

type SocialPlatform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';

function normalizePlatform(value: string): SocialPlatform {
  const normalized = value.trim().toUpperCase();

  if (normalized === 'YOUTUBE') {
    return 'YOUTUBE';
  }

  if (normalized === 'TIKTOK') {
    return 'TIKTOK';
  }

  if (normalized === 'INSTAGRAM') {
    return 'INSTAGRAM';
  }

  if (normalized === 'FACEBOOK') {
    return 'FACEBOOK';
  }

  throw new Error('Nieobsługiwana platforma');
}

/**
 * Krok 4 ("Gdzie i kiedy") finalizuje istniejące DRAFT-y utworzone przez
 * POST /api/publish-jobs/drafts (Krok 1→2). Nie tworzy nowych PublishJob-ów
 * od zera — przełącza wybrane DRAFT-y na PENDING, a odznaczone kasuje.
 */
export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
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

    const publishNow = body.publishNow === true;

    let scheduledDate = new Date();
    if (!publishNow) {
      if (!body.scheduledDate) {
        return badRequest('Validation failed', ['scheduledDate: scheduledDate jest wymagany']);
      }

      scheduledDate = new Date(body.scheduledDate);
      if (Number.isNaN(scheduledDate.getTime())) {
        return badRequest('scheduledDate is invalid');
      }

      await assertScheduleWindowAllowed(user.userId, scheduledDate);
    }

    if (!Array.isArray(body.targetPlatforms) || body.targetPlatforms.length === 0) {
      return badRequest('Validation failed', [
        'targetPlatforms: wymagane co najmniej 1 platforma',
      ]);
    }

    const targetPlatforms = Array.from(
      new Set(body.targetPlatforms.map((platform) => normalizePlatform(platform))),
    );

    if (targetPlatforms.includes('TIKTOK') && body.tiktokPostingConsent !== true) {
      return badRequest('Dla publikacji TikTok wymagana jest akceptacja warunków publikacji.');
    }

    const snapshot = await getSubscriptionSnapshot(user.userId);
    const userPlan = snapshot.subscription.plan;

    if (userPlan === 'FREE' && targetPlatforms.length > 1) {
      return badRequest('Plan Free pozwala publikować jednocześnie maksymalnie na 1 kanale social.');
    }

    const draftJobs = await prisma.publishJob.findMany({
      where: {
        postGroupId: body.postGroupId,
        status: 'DRAFT',
        video: { userId: user.userId },
      },
      include: {
        video: true,
        socialAccount: true,
      },
    });

    if (draftJobs.length === 0) {
      return badRequest('Nie znaleziono niedokończonego posta dla podanego postGroupId.');
    }

    const draftJobByPlatform = new Map(draftJobs.map((job) => [job.socialAccount.platform, job]));

    const missingPlatforms = targetPlatforms.filter((platform) => !draftJobByPlatform.has(platform));
    if (missingPlatforms.length > 0) {
      return badRequest(
        `Brak przygotowanej treści dla platform: ${missingPlatforms.join(', ')}`,
      );
    }

    if (targetPlatforms.includes('TIKTOK')) {
      const tiktokJob = draftJobByPlatform.get('TIKTOK')!;

      if (!tiktokJob.tiktokPrivacyLevel) {
        return badRequest('Dla TikTok wybierz poziom prywatności publikacji w kroku przeglądu.');
      }
    }

    for (let index = 0; index < targetPlatforms.length; index += 1) {
      await assertUsageAllowed(user.userId, 'publish_jobs');
    }

    const platformsToDelete = draftJobs
      .filter((job) => !targetPlatforms.includes(job.socialAccount.platform))
      .map((job) => job.id);

    const updateOperations = targetPlatforms.map((platform) => {
      const job = draftJobByPlatform.get(platform)!;

      return prisma.publishJob.update({
        where: { id: job.id },
        data: {
          status: 'PENDING',
          scheduledFor: scheduledDate,
          ...(platform === 'TIKTOK' ? { tiktokConsentAt: new Date() } : {}),
        },
        include: {
          video: true,
          socialAccount: true,
        },
      });
    });

    const transactionResults = await prisma.$transaction([
      ...updateOperations,
      prisma.publishJob.deleteMany({
        where: { id: { in: platformsToDelete } },
      }),
    ]);

    const updatedJobs = transactionResults.slice(0, updateOperations.length) as Array<
      Awaited<(typeof updateOperations)[number]>
    >;

    const delay = Math.max(0, scheduledDate.getTime() - Date.now());

    await incrementUsage(user.userId, 'publish_jobs', updatedJobs.length);

    const immediateOutcomes = publishNow
      ? await Promise.all(
          updatedJobs.map(async (publishJob) => ({
            jobId: publishJob.id,
            platform: publishJob.socialAccount.platform,
            outcome: await processPublishJobImmediately(publishJob.id),
          })),
        )
      : [];

    const responseJobs = publishNow
      ? await prisma.publishJob.findMany({
          where: { id: { in: updatedJobs.map((job) => job.id) } },
          include: {
            video: true,
            socialAccount: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        })
      : updatedJobs;

    const immediateOutcome =
      immediateOutcomes.length === 0
        ? null
        : immediateOutcomes.some((item) => item.outcome === 'failed')
          ? 'failed'
          : immediateOutcomes.some((item) => item.outcome === 'retryScheduled')
            ? 'retryScheduled'
            : immediateOutcomes.some((item) => item.outcome === 'skipped')
              ? 'skipped'
              : 'succeeded';

    return NextResponse.json({
      success: true,
      publishJob: responseJobs[0] ?? null,
      publishJobs: responseJobs,
      targetsCount: targetPlatforms.length,
      immediateOutcome,
      immediateOutcomes,
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
