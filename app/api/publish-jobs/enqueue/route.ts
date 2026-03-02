import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { assertUsageAllowed, incrementUsage } from '@/lib/server/subscription';
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
    await assertUsageAllowed(user.userId, 'publish_jobs');
    const body = (await request.json()) as {
      videoId?: string;
      scheduledDate?: string;
      publishNow?: boolean;
      platformSettings?: {
        platform?: string;
        title?: string;
        description?: string;
        tags?: string[];
        privacyStatus?: string;
      };
    };

    if (!body.videoId || !body.platformSettings?.platform) {
      return badRequest('Validation failed', [
        'videoId: videoId jest wymagany',
        'platformSettings.platform: platform jest wymagany',
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
    }

    const platform = normalizePlatform(body.platformSettings.platform);

    const [video, socialAccount] = await Promise.all([
      prisma.video.findFirst({ where: { id: body.videoId, userId: user.userId } }),
      prisma.socialAccount.findFirst({ where: { userId: user.userId, platform } }),
    ]);

    if (!video) {
      return badRequest('videoId nie należy do zalogowanego użytkownika');
    }

    if (!socialAccount) {
      return badRequest(`Brak podłączonego konta dla platformy ${platform}`);
    }

    const publishJob = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        scheduledFor: scheduledDate,
        video: { connect: { id: video.id } },
        socialAccount: { connect: { id: socialAccount.id } },
      },
      include: {
        video: true,
        socialAccount: true,
      },
    });

    const delay = Math.max(0, scheduledDate.getTime() - Date.now());

    await incrementUsage(user.userId, 'publish_jobs');

    const immediateOutcome = publishNow
      ? await processPublishJobImmediately(publishJob.id)
      : null;

    const responseJob = publishNow
      ? await prisma.publishJob.findUnique({
          where: { id: publishJob.id },
          include: {
            video: true,
            socialAccount: true,
          },
        })
      : publishJob;

    return NextResponse.json({
      success: true,
      publishJob: responseJob ?? publishJob,
      immediateOutcome,
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
      error.message.startsWith('Przekroczono limit planu FREE')
    ) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}
