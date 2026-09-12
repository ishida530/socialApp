import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, notFound, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { createDraftGroupForVideo } from '@/lib/server/publish-jobs';

const PUBLISH_JOB_INCLUDE = {
  video: true,
  socialAccount: true,
} as const;

async function loadGroup(userId: string, postGroupId: string, draftOnly: boolean) {
  const jobs = await prisma.publishJob.findMany({
    where: {
      postGroupId,
      ...(draftOnly ? { status: 'DRAFT' as const } : {}),
      video: { userId },
    },
    include: PUBLISH_JOB_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });

  return jobs;
}

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const postGroupId = request.nextUrl.searchParams.get('postGroupId');

    if (postGroupId) {
      // Once finalized, jobs are no longer DRAFT — the status screen still needs to read them
      // by postGroupId, so this lookup intentionally ignores status.
      const jobs = await loadGroup(user.userId, postGroupId, false);
      if (jobs.length === 0) {
        return NextResponse.json(null);
      }

      return NextResponse.json({ postGroupId, jobs });
    }

    const [latest, dbUser] = await Promise.all([
      prisma.publishJob.findFirst({
        where: {
          status: 'DRAFT',
          video: { userId: user.userId },
        },
        orderBy: { createdAt: 'desc' },
        select: { postGroupId: true },
      }),
      prisma.user.findUnique({
        where: { id: user.userId },
        select: { defaultExplicitContent: true },
      }),
    ]);

    if (!latest) {
      return NextResponse.json(null);
    }

    const jobs = await loadGroup(user.userId, latest.postGroupId, true);
    return NextResponse.json({
      postGroupId: latest.postGroupId,
      jobs,
      askDefaultExplicit: dbUser?.defaultExplicitContent === null,
    });
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
      key: `publish-jobs:drafts-create:${user.userId}`,
      limit: 15,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return tooManyRequests('Too many requests. Try again later.', rateLimit.retryAfterSec);
    }

    const body = (await request.json()) as {
      videoId?: string;
      contentType?: string;
      songTitle?: string;
      timezone?: string;
    };

    if (!body.videoId) {
      return badRequest('Validation failed', ['videoId: videoId jest wymagany']);
    }

    const result = await createDraftGroupForVideo(user.userId, body.videoId, {
      contentType: body.contentType,
      songTitle: body.songTitle,
      timezone: body.timezone,
    });

    if (!result.ok) {
      return badRequest(result.error);
    }

    return NextResponse.json({
      postGroupId: result.postGroupId,
      jobs: result.jobs,
      askDefaultExplicit: result.askDefaultExplicit,
      orchestrationWarning: result.orchestrationWarning,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const postGroupId = request.nextUrl.searchParams.get('postGroupId');

    if (!postGroupId) {
      return badRequest('Validation failed', ['postGroupId: wymagany parametr zapytania']);
    }

    const result = await prisma.publishJob.deleteMany({
      where: {
        postGroupId,
        status: 'DRAFT',
        video: { userId: user.userId },
      },
    });

    if (result.count === 0) {
      return notFound('Nie znaleziono niedokończonego posta do usunięcia.');
    }

    return NextResponse.json({ success: true, deletedCount: result.count });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
