import { NextRequest, NextResponse } from 'next/server';
import { Platform, PublishStatus } from '@prisma/client';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';

function normalizePlatform(value: string): Platform {
  const normalized = value.trim().toUpperCase();

  if (normalized === Platform.YOUTUBE) {
    return Platform.YOUTUBE;
  }

  if (normalized === Platform.TIKTOK) {
    return Platform.TIKTOK;
  }

  if (normalized === Platform.INSTAGRAM) {
    return Platform.INSTAGRAM;
  }

  if (normalized === Platform.FACEBOOK) {
    return Platform.FACEBOOK;
  }

  throw new Error('Nieobsługiwana platforma');
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json()) as {
      videoId?: string;
      scheduledDate?: string;
      platformSettings?: {
        platform?: string;
        title?: string;
        description?: string;
        tags?: string[];
        privacyStatus?: string;
      };
    };

    if (!body.videoId || !body.scheduledDate || !body.platformSettings?.platform) {
      return badRequest('Validation failed', [
        'videoId: videoId jest wymagany',
        'scheduledDate: scheduledDate jest wymagany',
        'platformSettings.platform: platform jest wymagany',
      ]);
    }

    const scheduledDate = new Date(body.scheduledDate);
    if (Number.isNaN(scheduledDate.getTime())) {
      return badRequest('scheduledDate is invalid');
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
        status: PublishStatus.PENDING,
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

    return NextResponse.json({
      success: true,
      publishJob,
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

    return serverError(error);
  }
}
