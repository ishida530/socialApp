import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, notFound, serverError, unauthorized } from '@/lib/server/http';
import { assertScheduleWindowAllowed } from '@/lib/server/subscription';

type PatchBody = {
  title?: string;
  description?: string | null;
  scheduledForByJobId?: Record<string, string>;
};

async function getOwnedVideo(userId: string, campaignId: string) {
  return prisma.video.findFirst({
    where: {
      id: campaignId,
      userId,
    },
    include: {
      publishJobs: true,
      drafts: true,
    },
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  try {
    const user = getAuthUserFromRequest(request);
    const { campaignId } = await context.params;

    if (!campaignId || campaignId.startsWith('campaign-')) {
      return badRequest('Ta kampania nie obsługuje edycji (brak trwałego powiązania z video).');
    }

    const body = (await request.json()) as PatchBody;
    const video = await getOwnedVideo(user.userId, campaignId);

    if (!video) {
      return notFound('Nie znaleziono kampanii.');
    }

    let hasUpdates = false;

    const nextTitle = body.title?.trim();
    if (typeof nextTitle === 'string' && nextTitle.length > 0 && nextTitle !== video.title) {
      hasUpdates = true;
      await prisma.video.update({
        where: { id: video.id },
        data: { title: nextTitle },
      });
    }

    if (typeof body.description === 'string' || body.description === null) {
      const nextDescription = body.description === null ? null : body.description.trim();
      if (nextDescription !== video.description) {
        hasUpdates = true;
        await prisma.video.update({
          where: { id: video.id },
          data: { description: nextDescription },
        });
      }
    }

    if (body.scheduledForByJobId && typeof body.scheduledForByJobId === 'object') {
      const scheduleUpdates: Array<{ jobId: string; parsedDate: Date }> = [];

      for (const [jobId, scheduledFor] of Object.entries(body.scheduledForByJobId)) {
        const parsedDate = new Date(scheduledFor);
        if (Number.isNaN(parsedDate.getTime())) {
          continue;
        }

        await assertScheduleWindowAllowed(user.userId, parsedDate);
        scheduleUpdates.push({ jobId, parsedDate });
      }

      if (scheduleUpdates.length > 0) {
        hasUpdates = true;
        await prisma.$transaction(
          scheduleUpdates.map((item) =>
            prisma.publishJob.updateMany({
              where: {
                id: item.jobId,
                videoId: video.id,
                status: 'PENDING',
              },
              data: {
                scheduledFor: item.parsedDate,
              },
            }),
          ),
        );
      }
    }

    if (!hasUpdates) {
      return NextResponse.json({
        success: true,
        updated: false,
      });
    }

    return NextResponse.json({
      success: true,
      updated: true,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    if (error instanceof Error && error.message.startsWith('Plan FREE pozwala planować publikacje')) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  try {
    const user = getAuthUserFromRequest(_request);
    const { campaignId } = await context.params;

    if (!campaignId || campaignId.startsWith('campaign-')) {
      return badRequest('Ta kampania nie obsługuje usuwania (brak trwałego powiązania z video).');
    }

    const video = await getOwnedVideo(user.userId, campaignId);
    if (!video) {
      return notFound('Nie znaleziono kampanii.');
    }

    const successJobsCount = video.publishJobs.filter((job) => job.status === 'SUCCESS').length;

    if (successJobsCount > 0) {
      const removableJobIds = video.publishJobs
        .filter((job) => job.status !== 'SUCCESS')
        .map((job) => job.id);

      await prisma.$transaction([
        prisma.publishJob.deleteMany({
          where: {
            id: {
              in: removableJobIds,
            },
          },
        }),
        prisma.draft.deleteMany({
          where: {
            videoId: video.id,
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        deleted: false,
        partiallyDeleted: true,
        message: 'Kampania zawiera opublikowane wpisy. Usunięto tylko wpisy nieopublikowane i drafty.',
      });
    }

    await prisma.video.delete({ where: { id: video.id } });

    return NextResponse.json({
      success: true,
      deleted: true,
      partiallyDeleted: false,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
