import { NextRequest, NextResponse } from 'next/server';
import { VideoStatus } from '@prisma/client';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const queryStatus = request.nextUrl.searchParams.get('status');
    const querySearch = request.nextUrl.searchParams.get('q')?.trim();

    const statusFilter = queryStatus
      ? ((queryStatus.toUpperCase() as VideoStatus) || undefined)
      : undefined;

    const allowedStatuses = new Set(Object.values(VideoStatus));
    if (statusFilter && !allowedStatuses.has(statusFilter)) {
      return badRequest('Nieprawidłowy status wideo');
    }

    const videos = await prisma.video.findMany({
      where: {
        userId: user.userId,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(querySearch
          ? {
              OR: [
                { title: { contains: querySearch, mode: 'insensitive' } },
                { description: { contains: querySearch, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { user: true, publishJobs: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(videos);
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
      title?: string;
      description?: string;
      sourceUrl?: string;
      thumbnailUrl?: string;
      durationSec?: number;
      status?: VideoStatus;
    };

    if (!body.title || !body.sourceUrl) {
      return badRequest('Validation failed', [
        'title: Tytuł jest wymagany',
        'sourceUrl: sourceUrl jest wymagany',
      ]);
    }

    const video = await prisma.video.create({
      data: {
        title: body.title,
        description: body.description,
        sourceUrl: body.sourceUrl,
        thumbnailUrl: body.thumbnailUrl,
        durationSec: body.durationSec,
        status: body.status ?? VideoStatus.UPLOADED,
        user: { connect: { id: user.userId } },
      },
    });

    return NextResponse.json(video);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
