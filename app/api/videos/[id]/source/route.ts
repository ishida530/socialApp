import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { readFile } from 'fs/promises';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { isValidSignedVideoSource } from '@/lib/server/video-source-signature';
import { isOwnMediaSourceUrl } from '@/lib/server/url-safety';

export const dynamic = 'force-dynamic';

function mediaContentType(mediaType: string, sourceUrl: string) {
  const path = sourceUrl.split('?')[0].toLowerCase();
  if (mediaType === 'IMAGE') {
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
  if (path.endsWith('.mov')) return 'video/quicktime';
  if (path.endsWith('.mkv')) return 'video/x-matroska';
  if (path.endsWith('.3gp')) return 'video/3gpp';
  if (path.endsWith('.3g2')) return 'video/3gpp2';
  if (path.endsWith('.mpeg') || path.endsWith('.mpg')) return 'video/mpeg';
  return 'video/mp4';
}

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

// TikTok photo posts accept at most 1080p (picture_size_check_failed otherwise, 2026-10-04) and
// JPEG/WEBP only. Phone photos are ~4000x3000, so the copy TikTok pulls is resized, auto-rotated from
// EXIF and re-encoded as JPEG here. The stored original is untouched (other platforms keep it).
const TIKTOK_PHOTO_VARIANT = 'tiktok-photo';

async function tiktokPhotoResponse(original: Buffer) {
  const { default: sharp } = await import('sharp');
  const image = sharp(original).rotate();
  const meta = await image.metadata();
  const landscape = (meta.width ?? 0) >= (meta.height ?? 0);
  const bytes = await image
    .resize({
      width: landscape ? 1920 : 1080,
      height: landscape ? 1080 : 1920,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90 })
    .toBuffer();

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function resolveSourceResponse(videoId: string, variant: string | null = null) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      sourceUrl: true,
      localPath: true,
      status: true,
      mediaType: true,
    },
  });

  if (!video || video.status !== 'READY') {
    return null;
  }

  // Only media Postfly stored itself is proxied (2026-10-03, SSRF review), and the response type is
  // forced from our own record - never the upstream Content-Type.
  const contentType = mediaContentType(video.mediaType, video.sourceUrl);
  const tiktokPhoto = variant === TIKTOK_PHOTO_VARIANT && video.mediaType === 'IMAGE';

  if (video.localPath) {
    const fileBuffer = await readFile(video.localPath);
    if (tiktokPhoto) {
      return tiktokPhotoResponse(fileBuffer);
    }
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  if (!isOwnMediaSourceUrl(video.sourceUrl)) {
    return null;
  }

  const upstream = await fetch(video.sourceUrl, {
    method: 'GET',
    cache: 'no-store',
    redirect: 'error',
  });

  if (!upstream.ok || !upstream.body) {
    return null;
  }

  if (tiktokPhoto) {
    return tiktokPhotoResponse(Buffer.from(await upstream.arrayBuffer()));
  }

  const contentLength = upstream.headers.get('content-length');

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Accept-Ranges': upstream.headers.get('accept-ranges') ?? 'bytes',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      ...(contentLength && !tiktokPhoto ? { 'Content-Length': contentLength } : {}),
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

  const response = await resolveSourceResponse(params.id, request.nextUrl.searchParams.get('variant'));

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
      mediaType: true,
    },
  });

  if (!video || video.status !== 'READY' || !isOwnMediaSourceUrl(video.sourceUrl)) {
    return new NextResponse(null, { status: 404 });
  }
  // The resized TikTok copy is a JPEG of a different size than the stored original.
  const tiktokPhoto = request.nextUrl.searchParams.get('variant') === TIKTOK_PHOTO_VARIANT && video.mediaType === 'IMAGE';
  const contentType = tiktokPhoto ? 'image/jpeg' : mediaContentType(video.mediaType, video.sourceUrl);

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
    redirect: 'error',
  });

  const contentLength = upstream.headers.get('content-length');

  return new NextResponse(null, {
    status: upstream.ok ? 200 : 404,
    headers: {
      'Content-Type': contentType,
      'Accept-Ranges': upstream.headers.get('accept-ranges') ?? 'bytes',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      ...(contentLength && !tiktokPhoto ? { 'Content-Length': contentLength } : {}),
    },
  });
}
