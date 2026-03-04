import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { readFile } from 'fs/promises';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { isValidSignedVideoSource } from '@/lib/server/video-source-signature';

export const dynamic = 'force-dynamic';

function hasValidSourceSignature(request: NextRequest, videoId: string) {
  const exp = request.nextUrl.searchParams.get('exp');
  const sig = request.nextUrl.searchParams.get('sig');
  return isValidSignedVideoSource(videoId, exp, sig);
}

function isUnauthorizedAuthError(error: unknown) {
  return error instanceof Error && error.message === 'Unauthorized';
}

function unauthorizedSourceResponse() {
  return NextResponse.json({ message: 'Unauthorized video source access' }, { status: 401 });
}

async function resolveSourceResponse(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      sourceUrl: true,
      localPath: true,
      status: true,
    },
  });

  if (!video || video.status !== 'READY') {
    return null;
  }

  if (video.localPath) {
    const fileBuffer = await readFile(video.localPath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  const upstream = await fetch(video.sourceUrl, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    return null;
  }

  const contentLength = upstream.headers.get('content-length');

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'video/mp4',
      'Accept-Ranges': upstream.headers.get('accept-ranges') ?? 'bytes',
      'Cache-Control': 'public, max-age=300',
      ...(contentLength ? { 'Content-Length': contentLength } : {}),
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const video = await prisma.video.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!video) {
    return NextResponse.json({ message: 'Video source unavailable' }, { status: 404 });
  }

  const signedAccess = hasValidSourceSignature(request, params.id);

  if (!signedAccess) {
    try {
      const user = getAuthUserFromRequest(request);
      if (user.userId !== video.userId) {
        return unauthorizedSourceResponse();
      }
    } catch (error) {
      if (isUnauthorizedAuthError(error)) {
        return unauthorizedSourceResponse();
      }

      throw error;
    }
  }

  const response = await resolveSourceResponse(params.id);

  if (!response) {
    return NextResponse.json({ message: 'Video source unavailable' }, { status: 404 });
  }

  return response;
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const video = await prisma.video.findUnique({
    where: { id: params.id },
    select: {
      userId: true,
      sourceUrl: true,
      status: true,
    },
  });

  if (!video || video.status !== 'READY') {
    return new NextResponse(null, { status: 404 });
  }

  const signedAccess = hasValidSourceSignature(request, params.id);
  if (!signedAccess) {
    try {
      const user = getAuthUserFromRequest(request);
      if (user.userId !== video.userId) {
        return new NextResponse(null, { status: 401 });
      }
    } catch (error) {
      if (isUnauthorizedAuthError(error)) {
        return new NextResponse(null, { status: 401 });
      }

      throw error;
    }
  }

  const upstream = await fetch(video.sourceUrl, {
    method: 'HEAD',
    cache: 'no-store',
  });

  const contentLength = upstream.headers.get('content-length');

  return new NextResponse(null, {
    status: upstream.ok ? 200 : 404,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'video/mp4',
      'Accept-Ranges': upstream.headers.get('accept-ranges') ?? 'bytes',
      'Cache-Control': 'public, max-age=300',
      ...(contentLength ? { 'Content-Length': contentLength } : {}),
    },
  });
}
