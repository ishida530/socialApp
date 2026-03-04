import { unlink } from 'fs/promises';
import { del } from '@vercel/blob';
import { prisma } from './prisma';
import { logError, logEvent } from './observability';

function canDeleteBlobByUrl(sourceUrl: string) {
  return sourceUrl.startsWith('https://') && sourceUrl.includes('blob.vercel-storage.com');
}

async function safeDeleteLocalFile(localPath: string | null) {
  if (!localPath) {
    return;
  }

  try {
    await unlink(localPath);
  } catch {
    // ignore: file may already be removed
  }
}

async function safeDeleteBlob(sourceUrl: string) {
  if (!canDeleteBlobByUrl(sourceUrl)) {
    return;
  }

  try {
    await del(sourceUrl);
  } catch {
    // ignore: blob may already be removed or token not available in local mode
  }
}

export async function cleanupMediaAfterFullPublish(videoId: string) {
  try {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        publishJobs: {
          select: { status: true },
        },
      },
    });

    if (!video || video.publishJobs.length === 0) {
      return;
    }

    const allPublished = video.publishJobs.every((job) => job.status === 'SUCCESS');
    if (!allPublished) {
      return;
    }

    await Promise.all([
      safeDeleteLocalFile(video.localPath),
      safeDeleteBlob(video.sourceUrl),
      prisma.draft.deleteMany({ where: { videoId: video.id } }),
      prisma.video.update({
        where: { id: video.id },
        data: {
          localPath: null,
          sourceUrl: `cleaned://published/${video.id}`,
          thumbnailUrl: null,
        },
      }),
    ]);

    logEvent('media-lifecycle', 'media-cleaned-after-publish', {
      videoId,
    });
  } catch (error) {
    logError('media-lifecycle', 'media-cleanup-failed', error, { videoId });
  }
}
