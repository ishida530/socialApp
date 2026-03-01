import { NextRequest, NextResponse } from 'next/server';
import { PublishStatus } from '@prisma/client';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const jobs = await prisma.publishJob.findMany({
      where: {
        video: { userId: user.userId },
      },
      include: {
        video: true,
        socialAccount: true,
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
    const body = (await request.json()) as {
      videoId?: string;
      socialAccountId?: string;
      scheduledFor?: string;
      status?: PublishStatus;
    };

    if (!body.videoId || !body.socialAccountId || !body.scheduledFor) {
      return badRequest('Validation failed', [
        'videoId: videoId jest wymagany',
        'socialAccountId: socialAccountId jest wymagany',
        'scheduledFor: scheduledFor jest wymagany',
      ]);
    }

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

    const job = await prisma.publishJob.create({
      data: {
        scheduledFor: new Date(body.scheduledFor),
        status: body.status ?? PublishStatus.PENDING,
        video: { connect: { id: body.videoId } },
        socialAccount: { connect: { id: body.socialAccountId } },
      },
    });

    return NextResponse.json(job);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
