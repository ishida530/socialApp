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

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json()) as {
      videoId?: string;
      scheduledDate?: string;
      publishNow?: boolean;
      targetPlatforms?: string[];
      platformSettings?: {
        platform?: string;
        title?: string;
        description?: string;
        tags?: string[];
        privacyStatus?: string;
      };
    };

    if (!body.videoId) {
      return badRequest('Validation failed', [
        'videoId: videoId jest wymagany',
      ]);
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

    const requestedPlatforms = Array.isArray(body.targetPlatforms)
      ? body.targetPlatforms
      : body.platformSettings?.platform
        ? [body.platformSettings.platform]
        : [];

    if (requestedPlatforms.length === 0) {
      return badRequest('Validation failed', [
        'targetPlatforms: wymagane co najmniej 1 platforma (lub platformSettings.platform)',
      ]);
    }

    const targetPlatforms = Array.from(
      new Set(requestedPlatforms.map((platform) => normalizePlatform(platform))),
    );

    const snapshot = await getSubscriptionSnapshot(user.userId);
    const userPlan = snapshot.subscription.plan;

    if (userPlan === 'FREE' && targetPlatforms.length > 1) {
      return badRequest('Plan Free pozwala publikować jednocześnie maksymalnie na 1 kanale social.');
    }

    const [video, socialAccounts] = await Promise.all([
      prisma.video.findFirst({ where: { id: body.videoId, userId: user.userId } }),
      prisma.socialAccount.findMany({
        where: {
          userId: user.userId,
          platform: {
            in: targetPlatforms,
          },
        },
      }),
    ]);

    if (!video) {
      return badRequest('videoId nie należy do zalogowanego użytkownika');
    }

    const socialAccountByPlatform = new Map(
      socialAccounts.map((socialAccount) => [socialAccount.platform, socialAccount]),
    );

    const missingPlatforms = targetPlatforms.filter(
      (platform) => !socialAccountByPlatform.has(platform),
    );

    if (missingPlatforms.length > 0) {
      return badRequest(
        `Brak podłączonych kont dla platform: ${missingPlatforms.join(', ')}`,
      );
    }

    for (let index = 0; index < targetPlatforms.length; index += 1) {
      await assertUsageAllowed(user.userId, 'publish_jobs');
    }

    const createdJobs = await prisma.$transaction(
      targetPlatforms.map((platform) =>
        prisma.publishJob.create({
          data: {
            status: 'PENDING',
            scheduledFor: scheduledDate,
            video: { connect: { id: video.id } },
            socialAccount: { connect: { id: socialAccountByPlatform.get(platform)!.id } },
          },
          include: {
            video: true,
            socialAccount: true,
          },
        }),
      ),
    );

    const delay = Math.max(0, scheduledDate.getTime() - Date.now());

    await incrementUsage(user.userId, 'publish_jobs', createdJobs.length);

    const immediateOutcomes = publishNow
      ? await Promise.all(
          createdJobs.map(async (publishJob) => ({
            jobId: publishJob.id,
            platform: publishJob.socialAccount.platform,
            outcome: await processPublishJobImmediately(publishJob.id),
          })),
        )
      : [];

    const responseJobs = publishNow
      ? await prisma.publishJob.findMany({
          where: { id: { in: createdJobs.map((job) => job.id) } },
          include: {
            video: true,
            socialAccount: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        })
      : createdJobs;

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
