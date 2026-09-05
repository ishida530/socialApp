import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Platform } from '@prisma/client';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, notFound, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { generatePlatformBundles } from '@/lib/server/composer-drafts';
import { collectContentWarnings } from '@/lib/server/content-safety';

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

    const [video, socialAccounts, dbUser] = await Promise.all([
      prisma.video.findFirst({ where: { id: body.videoId, userId: user.userId } }),
      prisma.socialAccount.findMany({
        where: { userId: user.userId },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.user.findUnique({
        where: { id: user.userId },
        select: { defaultExplicitContent: true },
      }),
    ]);

    if (!video) {
      return badRequest('videoId nie należy do zalogowanego użytkownika');
    }

    if (socialAccounts.length === 0) {
      return badRequest('Brak podłączonych kont social. Połącz przynajmniej jedno konto przed dodaniem posta.');
    }

    const accountByPlatform = new Map<Platform, (typeof socialAccounts)[number]>();
    socialAccounts.forEach((account) => {
      if (!accountByPlatform.has(account.platform)) {
        accountByPlatform.set(account.platform, account);
      }
    });

    const connectedPlatforms = Array.from(accountByPlatform.keys()).filter(
      (platform) => !(video.mediaType === 'IMAGE' && platform === Platform.YOUTUBE),
    );

    if (connectedPlatforms.length === 0) {
      return badRequest('Żadna podłączona platforma nie obsługuje tego typu materiału.');
    }

    const postGroupId = randomUUID();

    const createdJobs = await prisma.$transaction(
      connectedPlatforms.map((platform) =>
        prisma.publishJob.create({
          data: {
            status: 'DRAFT',
            postGroupId,
            scheduledFor: new Date(),
            video: { connect: { id: video.id } },
            socialAccount: { connect: { id: accountByPlatform.get(platform)!.id } },
          },
          include: PUBLISH_JOB_INCLUDE,
        }),
      ),
    );

    const rawInputParts = [body.contentType?.trim(), body.songTitle?.trim()].filter(Boolean);

    const { bundlesByPlatform, orchestrationWarning } = await generatePlatformBundles(user.userId, {
      rawInput: rawInputParts.join(' — '),
      targetPlatforms: connectedPlatforms,
      timezone: body.timezone || 'Europe/Warsaw',
      idempotencyKey: postGroupId,
    });

    const updatedJobs = await Promise.all(
      createdJobs.map(async (job) => {
        const bundle = bundlesByPlatform.get(job.socialAccount.platform);
        const caption = bundle?.caption ?? '';
        const hashtags = bundle?.hashtags ?? [];

        return prisma.publishJob.update({
          where: { id: job.id },
          data: {
            caption,
            hashtags,
            title: bundle?.title ?? null,
            contentWarnings: collectContentWarnings(caption, job.socialAccount.platform),
          },
          include: PUBLISH_JOB_INCLUDE,
        });
      }),
    );

    return NextResponse.json({
      postGroupId,
      jobs: updatedJobs,
      askDefaultExplicit: dbUser?.defaultExplicitContent === null,
      orchestrationWarning,
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
