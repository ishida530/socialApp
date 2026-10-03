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

// Account/media deletion (2026-10-03): the privacy policy promises uploaded files are erased, not
// just the database rows that point at them.
export async function deleteVideoFiles(video: { sourceUrl: string; thumbnailUrl: string | null; localPath: string | null }) {
  await Promise.all([
    safeDeleteLocalFile(video.localPath),
    safeDeleteBlob(video.sourceUrl),
    video.thumbnailUrl ? safeDeleteBlob(video.thumbnailUrl) : Promise.resolve(),
  ]);
}

export async function deleteAllUserMediaFiles(userId: string) {
  const videos = await prisma.video.findMany({
    where: { userId },
    select: { sourceUrl: true, thumbnailUrl: true, localPath: true },
  });
  // One batched Blob call instead of one per file - a large library must not hit the function
  // time limit mid-deletion (2026-10-03, review).
  const blobUrls = videos
    .flatMap((video) => [video.sourceUrl, video.thumbnailUrl])
    .filter((url): url is string => Boolean(url && canDeleteBlobByUrl(url)));
  await Promise.all(videos.map((video) => safeDeleteLocalFile(video.localPath)));
  for (let index = 0; index < blobUrls.length; index += 100) {
    try {
      await del(blobUrls.slice(index, index + 100));
    } catch {
      // ignore: blobs may already be removed or the token missing in local mode
    }
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
      // The AI-preview thumbnail (2026-10-03) lives in Blob too.
      video.thumbnailUrl ? safeDeleteBlob(video.thumbnailUrl) : Promise.resolve(),
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
