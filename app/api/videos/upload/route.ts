import { NextRequest, NextResponse } from 'next/server';
import { VideoStatus } from '@prisma/client';
import { extname } from 'path';
import { writeFile } from 'fs/promises';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { ensureUploadsDirectory } from '@/lib/server/uploads';

const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return badRequest('Brak pliku do przesłania');
    }

    const extension = extname(file.name).toLowerCase();
    const allowed = extension === '.mp4' || extension === '.mov';
    if (!allowed) {
      return badRequest('Dozwolone formaty plików: .mp4, .mov');
    }

    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      return badRequest('Maksymalny rozmiar pliku to 500MB');
    }

    const baseName = file.name.replace(extension, '');
    const safeName = sanitizeFileName(baseName);
    const fileName = `${Date.now()}-${safeName}${extension}`;

    const uploadDir = ensureUploadsDirectory();
    const filePath = `${uploadDir}/${fileName}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, bytes);

    const sourceUrl = `/uploads/videos/${fileName}`;
    const title = baseName || `video-${Date.now()}`;

    const video = await prisma.video.create({
      data: {
        title,
        sourceUrl,
        localPath: filePath,
        status: VideoStatus.READY,
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
