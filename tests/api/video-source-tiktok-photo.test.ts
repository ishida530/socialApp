import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { NextRequest } from 'next/server';

// TikTok photo posts fail with picture_size_check_failed above 1080p (2026-10-04): the source route
// serves a resized JPEG for the tiktok-photo variant and the untouched original otherwise.

const { GET } = await import('@/app/api/videos/[id]/source/route');
const { prisma } = await import('@/lib/server/prisma');
const { createSignedVideoSourceParams } = await import('@/lib/server/video-source-signature');
const { createTestUser, deleteTestUser, createVideo } = await import('../helpers/fixtures');
const { default: sharp } = await import('sharp');

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
});

async function photoVideo(width: number, height: number) {
  const { user } = await createTestUser();
  cleanup.push(() => deleteTestUser(user.id));
  const dir = await mkdtemp(join(tmpdir(), 'postfly-photo-'));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'photo.png');
  await writeFile(file, await sharp({ create: { width, height, channels: 3, background: '#336699' } }).png().toBuffer());
  const video = await createVideo(user.id, { mediaType: 'IMAGE', sourceUrl: '/uploads/videos/photo.png' });
  await prisma.video.update({ where: { id: video.id }, data: { localPath: file, status: 'READY' } });
  return video.id;
}

function signedRequest(videoId: string, variant?: string) {
  const { exp, sig } = createSignedVideoSourceParams(videoId);
  const url = new URL(`http://localhost:3000/api/videos/${videoId}/source`);
  url.searchParams.set('exp', exp);
  url.searchParams.set('sig', sig);
  if (variant) url.searchParams.set('variant', variant);
  return new NextRequest(url);
}

describe('GET /api/videos/[id]/source tiktok-photo variant', () => {
  it('serves a JPEG resized to fit 1920x1080 for a large landscape photo', async () => {
    const id = await photoVideo(4000, 3000);
    const response = await GET(signedRequest(id, 'tiktok-photo'), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBeLessThanOrEqual(1920);
    expect(meta.height).toBeLessThanOrEqual(1080);
  });

  it('fits a portrait photo into 1080x1920', async () => {
    const id = await photoVideo(3000, 4000);
    const response = await GET(signedRequest(id, 'tiktok-photo'), { params: Promise.resolve({ id }) });
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect(meta.width).toBeLessThanOrEqual(1080);
    expect(meta.height).toBeLessThanOrEqual(1920);
  });

  it('serves the untouched original without the variant', async () => {
    const id = await photoVideo(4000, 3000);
    const response = await GET(signedRequest(id), { params: Promise.resolve({ id }) });
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect(meta.width).toBe(4000);
    expect(meta.format).toBe('png');
  });
});
