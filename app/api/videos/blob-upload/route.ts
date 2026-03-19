import { NextRequest, NextResponse } from 'next/server';
import { VideoStatus } from '@prisma/client';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getSiteUrl } from '@/lib/site-url';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { assertUsageAllowed, incrementUsage } from '@/lib/server/subscription';
import { prisma } from '@/lib/server/prisma';

function sanitizeTitle(value: string) {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  return cleaned.length > 0 ? cleaned.slice(0, 120) : `video-${Date.now()}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload, _multipart) => {
        const user = getAuthUserFromRequest(request);
        await assertUsageAllowed(user.userId, 'video_uploads');

        let titleFromClient = '';
        if (clientPayload) {
          try {
            const parsed = JSON.parse(clientPayload) as { title?: string };
            titleFromClient = String(parsed.title ?? '');
          } catch {
            titleFromClient = '';
          }
        }

        return {
          allowedContentTypes: ['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp'],
          addRandomSuffix: true,
          callbackUrl: new URL('/api/videos/blob-upload', getSiteUrl()).toString(),
          tokenPayload: JSON.stringify({
            userId: user.userId,
            title: sanitizeTitle(titleFromClient),
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let payload: { userId?: string; title?: string } | null = null;
        if (tokenPayload) {
          try {
            payload = JSON.parse(tokenPayload) as { userId?: string; title?: string };
          } catch {
            payload = null;
          }
        }

        const userId = payload?.userId;

        if (!userId) {
          throw new Error('Missing userId in upload token payload');
        }

        const title = sanitizeTitle(payload?.title ?? 'Nowy materiał');

        const existing = await prisma.video.findFirst({
          where: {
            userId,
            sourceUrl: blob.url,
          },
          select: { id: true },
        });

        if (existing) {
          return;
        }

        await prisma.video.create({
          data: {
            title,
            sourceUrl: blob.url,
            localPath: null,
            status: VideoStatus.READY,
            user: { connect: { id: userId } },
          },
        });

        await incrementUsage(userId, 'video_uploads');
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    if (error instanceof Error && error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      return badRequest('Brak konfiguracji storage. Ustaw BLOB_READ_WRITE_TOKEN na Vercel.');
    }

    if (error instanceof Error && error.message.includes('Przekroczono limit planu')) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}
