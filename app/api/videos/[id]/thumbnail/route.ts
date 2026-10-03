import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { detectMediaSignature } from '@/lib/server/magic-bytes';

// Video thumbnail (2026-10-03, AI gaps): the composer grabs one frame of an uploaded video in the
// browser and sends it here, so the AI caption generator can "see" videos too, not only photos
// (lib/server/composer-drafts.ts previewImageUrls). Deliberately NOT through /api/videos/blob-upload:
// every blob uploaded there becomes a new Video row and counts toward the plan's upload limit.

const MAX_THUMBNAIL_BYTES = 1024 * 1024;
const EXTENSION_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getAuthUserFromRequest(request);

    const rateLimit = await consumeRateLimit({
      key: `videos:thumbnail:${user.userId}`,
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return tooManyRequests('Too many requests. Try again later.', rateLimit.retryAfterSec);
    }

    const params = await context.params;
    const video = await prisma.video.findFirst({
      where: { id: params.id, userId: user.userId },
      select: { id: true, mediaType: true },
    });
    if (!video) {
      return badRequest('Nie znaleziono materiału dla zalogowanego użytkownika');
    }
    if (video.mediaType !== 'VIDEO') {
      return badRequest('Miniatura dotyczy tylko filmów.');
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return badRequest('Brak pliku miniatury');
    }
    if (file.size > MAX_THUMBNAIL_BYTES) {
      return badRequest('Miniatura może mieć najwyżej 1 MB.');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const signature = detectMediaSignature(bytes);
    if (signature !== 'image/jpeg' && signature !== 'image/png' && signature !== 'image/webp') {
      return badRequest('Miniatura musi być obrazem JPEG, PNG albo WebP.');
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      // Local development without Blob storage - the caption simply falls back to text only.
      return NextResponse.json({ success: false, thumbnailUrl: null });
    }

    const blob = await put(`thumbnails/${video.id}.${EXTENSION_BY_TYPE[signature]}`, Buffer.from(bytes), {
      access: 'public',
      contentType: signature,
      addRandomSuffix: true,
    });

    await prisma.video.update({ where: { id: video.id }, data: { thumbnailUrl: blob.url } });

    return NextResponse.json({ success: true, thumbnailUrl: blob.url });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
