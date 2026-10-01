import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import {
  assertScheduleWindowAllowed,
  assertUsageAllowed,
  incrementUsage,
} from '@/lib/server/subscription';
import { PUBLIC_SOCIAL_ACCOUNT_SELECT } from '@/lib/server/public-fields';

type PublishJobStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);

    // ?postGroupId= - the composer's post-publish status screen polls just its own jobs (TikTok
    // guideline 5e: users must be able to follow their post's status). Only public account fields,
    // never the (encrypted) tokens.
    const postGroupId = request.nextUrl.searchParams.get('postGroupId');
    if (postGroupId) {
      const groupJobs = await prisma.publishJob.findMany({
        where: { postGroupId, status: { not: 'DRAFT' }, video: { userId: user.userId } },
        include: {
          video: true,
          socialAccount: { select: { id: true, platform: true, handle: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      return NextResponse.json(groupJobs);
    }

    const jobs = await prisma.publishJob.findMany({
      where: {
        video: { userId: user.userId },
      },
      include: {
        video: true,
        socialAccount: { select: PUBLIC_SOCIAL_ACCOUNT_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(jobs);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);

    const rateLimit = await consumeRateLimit({
      key: `publish-jobs:create:${user.userId}`,
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return tooManyRequests('Too many requests. Try again later.', rateLimit.retryAfterSec);
    }

    await assertUsageAllowed(user.userId, 'publish_jobs');
    const body = (await request.json()) as {
      videoId?: string;
      socialAccountId?: string;
      scheduledFor?: string;
      status?: PublishJobStatus;
    };

    if (!body.videoId || !body.socialAccountId || !body.scheduledFor) {
      return badRequest('Validation failed', [
        'videoId: videoId jest wymagany',
        'socialAccountId: socialAccountId jest wymagany',
        'scheduledFor: scheduledFor jest wymagany',
      ]);
    }

    const scheduledFor = new Date(body.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime())) {
      return badRequest('scheduledFor is invalid');
    }

    await assertScheduleWindowAllowed(user.userId, scheduledFor);

    const [video, socialAccount] = await Promise.all([
      prisma.video.findFirst({ where: { id: body.videoId, userId: user.userId } }),
      prisma.socialAccount.findFirst({
        where: { id: body.socialAccountId, userId: user.userId },
      }),
    ]);

    if (!video || !socialAccount) {
      return badRequest(
        'videoId lub socialAccountId nie należy do zalogowanego użytkownika',
      );
    }

    // TikTok only through the composer (2026-09-30, TikTok audit guidelines 2b/5c): this raw
    // endpoint takes no privacy level and no consent.
    if (socialAccount.platform === 'TIKTOK') {
      return badRequest('Posty na TikTok publikujesz z kreatora posta (wymagany wybór prywatności i zgoda).');
    }

    const job = await prisma.publishJob.create({
      data: {
        scheduledFor,
        status: body.status ?? 'PENDING',
        postGroupId: randomUUID(),
        video: { connect: { id: body.videoId } },
        socialAccount: { connect: { id: body.socialAccountId } },
      },
    });

    await incrementUsage(user.userId, 'publish_jobs');

    return NextResponse.json(job);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
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
