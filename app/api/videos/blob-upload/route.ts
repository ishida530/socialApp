import { NextRequest, NextResponse } from 'next/server';
import { MediaType, VideoStatus } from '@prisma/client';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { del } from '@vercel/blob';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { assertUsageAllowed, incrementUsage } from '@/lib/server/subscription';
import { prisma } from '@/lib/server/prisma';
import { detectMediaSignature, matchesDeclaredContentTypeKind } from '@/lib/server/magic-bytes';

// Vercel Blob's client-upload flow sends bytes directly from the browser to
// storage — the server never sees them before they're already public. This
// fetches just enough of the uploaded blob to sniff its real format after the
// fact, so a mislabeled/malicious file can still be caught and removed.
async function fetchLeadingBytes(url: string, length = 32): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url, { headers: { Range: `bytes=0-${length - 1}` } });
    if (!response.ok && response.status !== 206) {
      return null;
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

function sanitizeTitle(value: string) {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  return cleaned.length > 0 ? cleaned.slice(0, 120) : `video-${Date.now()}`;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload, _multipart) => {
        const tokenStartTime = Date.now();
        try {
          const user = getAuthUserFromRequest(request);

          const rateLimit = await consumeRateLimit({
            key: `videos:blob-upload:${user.userId}`,
            limit: 20,
            windowMs: 15 * 60 * 1000,
          });
          if (!rateLimit.allowed) {
            throw new Error('Too many upload attempts. Try again later.');
          }

          console.log('[blob-upload] onBeforeGenerateToken', {
            userId: user.userId,
            pathname: _pathname,
            isMultipart: _multipart,
          });

          await assertUsageAllowed(user.userId, 'video_uploads');
          
          console.log('[blob-upload] usage allowed', {
            userId: user.userId,
            durationMs: Date.now() - tokenStartTime,
          });

          let titleFromClient = '';
          if (clientPayload) {
            try {
              const parsed = JSON.parse(clientPayload) as { title?: string };
              titleFromClient = String(parsed.title ?? '');
            } catch {
              titleFromClient = '';
            }
          }

          const tokenPayload = JSON.stringify({
            userId: user.userId,
            title: sanitizeTitle(titleFromClient),
          });

          // For large multipart uploads, extend token validity to prevent expiration during long uploads
          // Mobile 60MB upload can take 2-5+ minutes on slow networks
          // Default is 1 hour, but we extend to 2 hours for safety on large files
          const validUntil = _multipart ? Date.now() + 2 * 60 * 60 * 1000 : Date.now() + 60 * 60 * 1000;

          console.log('[blob-upload] token generated', {
            userId: user.userId,
            isMultipart: _multipart,
            validUntilMinutes: (validUntil - Date.now()) / (60 * 1000),
            durationMs: Date.now() - tokenStartTime,
          });

          return {
            allowedContentTypes: [
              'video/mp4',
              'video/quicktime',
              'video/3gpp',
              'video/3gpp2',
              'video/mpeg',
              'video/x-matroska',
              'image/jpeg',
              'image/png',
              'image/webp',
            ],
            addRandomSuffix: true,
            validUntil,
            tokenPayload,
          };
        } catch (error) {
          console.error('[blob-upload] onBeforeGenerateToken error', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : '',
            durationMs: Date.now() - tokenStartTime,
          });
          throw error;
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const onCompleteStartTime = Date.now();
        try {
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

          console.log('[blob-upload] onUploadCompleted start', {
            userId,
            blobUrl: blob.url,
            contentType: blob.contentType,
          });

          const title = sanitizeTitle(payload?.title ?? 'Nowy materiał');

          const existing = await prisma.video.findFirst({
            where: {
              userId,
              sourceUrl: blob.url,
            },
            select: { id: true },
          });

          if (existing) {
            console.log('[blob-upload] video already exists', { videoId: existing.id, userId });
            return;
          }

          const leadingBytes = await fetchLeadingBytes(blob.url);
          const signature = leadingBytes ? detectMediaSignature(leadingBytes) : null;
          const contentTypeOk =
            leadingBytes !== null &&
            matchesDeclaredContentTypeKind(blob.contentType ?? '', signature);

          if (!contentTypeOk) {
            console.error('[blob-upload] rejected: content does not match declared type', {
              userId,
              blobUrl: blob.url,
              declaredContentType: blob.contentType,
              detectedSignature: signature,
            });

            await del(blob.url).catch(() => {});
            throw new Error('Uploaded file content does not match its declared type');
          }

          const mediaType = (blob.contentType ?? '').startsWith('image/') ? MediaType.IMAGE : MediaType.VIDEO;

          const createdVideo = await prisma.video.create({
            data: {
              title,
              sourceUrl: blob.url,
              localPath: null,
              status: VideoStatus.READY,
              mediaType,
              user: { connect: { id: userId } },
            },
          });

          await incrementUsage(userId, 'video_uploads');

          console.log('[blob-upload] onUploadCompleted success', {
            userId,
            videoId: createdVideo.id,
            blobUrl: blob.url,
            durationMs: Date.now() - onCompleteStartTime,
          });
        } catch (error) {
          console.error('[blob-upload] onUploadCompleted error', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : '',
            durationMs: Date.now() - onCompleteStartTime,
          });
          throw error;
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';

    console.error('[blob-upload] POST error', {
      error: errorMessage,
      stack: errorStack,
      type: error instanceof Error ? error.constructor.name : 'Unknown',
    });

    if (error instanceof Error && error.message === 'Unauthorized') {
      console.error('[blob-upload] Unauthorized error');
      return unauthorized();
    }

    if (error instanceof Error && error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      console.error('[blob-upload] Missing BLOB_READ_WRITE_TOKEN');
      return badRequest('Brak konfiguracji storage. Ustaw BLOB_READ_WRITE_TOKEN na Vercel.');
    }

    if (error instanceof Error && error.message.includes('Przekroczono limit planu')) {
      console.error('[blob-upload] Usage limit exceeded', { message: error.message });
      return badRequest(error.message);
    }

    if (error instanceof Error && error.message.includes('Too many upload attempts')) {
      return tooManyRequests(error.message);
    }

    console.error('[blob-upload] Unhandled error, returning 500', { errorMessage });
    return serverError(error);
  }
}
