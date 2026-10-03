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
      // No `user` include: it returned the whole User row (password hash, 2FA secret) to the client.
      include: { publishJobs: true },
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

// POST was removed (2026-10-03, security review): it accepted any sourceUrl plus a client-chosen
// status. Media enters only through the upload routes (videos/upload, videos/blob-upload).
