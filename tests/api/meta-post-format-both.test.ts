import { afterEach, describe, expect, it } from 'vitest';
import { enqueueDraftGroup } from '@/lib/server/publish-jobs';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo, createDraftJob } from '../helpers/fixtures';

// Facebook "Oba" (BOTH): unlike Instagram, a Reel and a plain video post on Facebook are
// genuinely separate publications (no share_to_feed equivalent that puts a Reel in both
// places), so "Oba" is realized as a second, independent PublishJob created at enqueue time -
// not a new publish-processor code path. publishNow:false is used throughout so this exercises
// only the DRAFT-splitting behavior, without needing to mock the actual platform publish calls.

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('enqueueDraftGroup: Facebook metaPostFormat BOTH splits into two jobs', () => {
  it('creates a sibling FEED job alongside the original (now REELS) job, both PENDING', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id, { mediaType: 'VIDEO' });
    const postGroupId = `group-${user.id}`;
    const job = await createDraftJob({
      videoId: video.id,
      socialAccountId: account.id,
      postGroupId,
    });
    await prisma.publishJob.update({
      where: { id: job.id },
      data: { metaPostFormat: 'BOTH', caption: 'shared caption', hashtags: ['a', 'b'] },
    });

    const result = await enqueueDraftGroup(user.id, {
      postGroupId,
      publishNow: false,
      scheduledDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      targetPlatforms: ['FACEBOOK'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.targetsCount).toBe(2);
    expect(result.publishJobs).toHaveLength(2);

    const allJobs = await prisma.publishJob.findMany({ where: { postGroupId } });
    expect(allJobs).toHaveLength(2);

    const reelsJob = allJobs.find((j) => j.id === job.id)!;
    const siblingJob = allJobs.find((j) => j.id !== job.id)!;

    expect(reelsJob.status).toBe('PENDING');
    expect(reelsJob.metaPostFormat).toBe('REELS');

    expect(siblingJob.status).toBe('PENDING');
    expect(siblingJob.metaPostFormat).toBe('FEED');
    expect(siblingJob.caption).toBe('shared caption');
    expect(siblingJob.hashtags).toEqual(['a', 'b']);
    expect(siblingJob.socialAccountId).toBe(account.id);
    expect(siblingJob.videoId).toBe(video.id);
  });

  it('does not split a plain REELS or FEED job - still exactly one job after enqueue', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id, { mediaType: 'VIDEO' });
    const postGroupId = `group-${user.id}`;
    const job = await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId });
    await prisma.publishJob.update({ where: { id: job.id }, data: { metaPostFormat: 'REELS' } });

    const result = await enqueueDraftGroup(user.id, {
      postGroupId,
      publishNow: false,
      scheduledDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      targetPlatforms: ['FACEBOOK'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targetsCount).toBe(1);

    const allJobs = await prisma.publishJob.findMany({ where: { postGroupId } });
    expect(allJobs).toHaveLength(1);
  });
});
