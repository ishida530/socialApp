import { NextRequest, NextResponse } from 'next/server';
import { VideoStatus } from '@prisma/client';
import { extname } from 'path';
import { writeFile } from 'fs/promises';
import { put } from '@vercel/blob';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { ensureUploadsDirectory } from '@/lib/server/uploads';
import { assertUsageAllowed, incrementUsage } from '@/lib/server/subscription';

export const maxDuration = 60;

const MAX_MEDIA_SIZE_BYTES = 500 * 1024 * 1024;

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
}

function canUseBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function canUseLocalStorage() {
  return process.env.VERCEL !== '1';
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    await assertUsageAllowed(user.userId, 'video_uploads');
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return badRequest('Brak pliku do przesłania');
    }

    const extension = extname(file.name).toLowerCase();
    const allowed =
      extension === '.mp4' ||
      extension === '.mov' ||
      extension === '.jpg' ||
      extension === '.jpeg' ||
      extension === '.png' ||
      extension === '.webp';
    if (!allowed) {
      return badRequest('Dozwolone formaty plików: .mp4, .mov, .jpg, .jpeg, .png, .webp');
    }

    if (file.size > MAX_MEDIA_SIZE_BYTES) {
      return badRequest('Maksymalny rozmiar pliku to 500MB');
    }

    const baseName = file.name.replace(extension, '');
    const safeName = sanitizeFileName(baseName);
    const fileName = `${Date.now()}-${safeName}${extension}`;

    let sourceUrl: string;
    let localPath: string | null = null;

    if (canUseBlobStorage()) {
      const blob = await put(`uploads/videos/${fileName}`, file, {
        access: 'public',
        addRandomSuffix: true,
      });

      sourceUrl = blob.url;
    } else if (canUseLocalStorage()) {
      const uploadDir = ensureUploadsDirectory();
      const filePath = `${uploadDir}/${fileName}`;

      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, bytes);

      sourceUrl = `/uploads/videos/${fileName}`;
      localPath = filePath;
    } else {
      return badRequest('Brak konfiguracji storage. Dodaj BLOB_READ_WRITE_TOKEN w Vercel.');
    }

    const title = baseName || `media-${Date.now()}`;

    const video = await prisma.video.create({
      data: {
        title,
        sourceUrl,
        localPath,
        status: VideoStatus.READY,
        user: { connect: { id: user.userId } },
      },
    });

    await incrementUsage(user.userId, 'video_uploads');

    return NextResponse.json(video);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    if (
      error instanceof Error &&
      error.message.startsWith('Przekroczono limit planu FREE')
    ) {
      return badRequest(error.message);
    }

    if (error instanceof Error && error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      return badRequest('Brak konfiguracji storage. Ustaw BLOB_READ_WRITE_TOKEN na Vercel.');
    }

    return serverError(error);
  }
}
