import { afterEach, describe, expect, it } from 'vitest';
import { enqueueDraftGroupOptimally } from '@/lib/server/publish-jobs';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo, createDraftJob } from '../helpers/fixtures';

// Autopilot / "🎯 Zaplanuj optymalnie" (2026-09-14): schedules every ready DRAFT platform at its
// own data-driven optimal time (PublishJob.suggestedScheduledFor), one call instead of the user
// reading the suggestion text and typing a matching date/time by hand.

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('enqueueDraftGroupOptimally', () => {
  it('schedules each platform at its own suggestedScheduledFor', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const igAccount = await createSocialAccount(user.id, 'INSTAGRAM');
    const fbAccount = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    const postGroupId = `optimal-${video.id}`;

    const igTime = new Date('2026-09-20T19:00:00.000Z');
    const fbTime = new Date('2026-09-20T12:00:00.000Z');

    const igJob = await createDraftJob({ videoId: video.id, socialAccountId: igAccount.id, postGroupId });
    await prisma.publishJob.update({ where: { id: igJob.id }, data: { suggestedScheduledFor: igTime } });
    const fbJob = await createDraftJob({ videoId: video.id, socialAccountId: fbAccount.id, postGroupId });
    await prisma.publishJob.update({ where: { id: fbJob.id }, data: { suggestedScheduledFor: fbTime } });

    const result = await enqueueDraftGroupOptimally(user.id, postGroupId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.skippedPlatforms).toEqual([]);
    expect(result.scheduled).toHaveLength(2);

    const igEnqueued = result.scheduled.find((job) => job.socialAccount.platform === 'INSTAGRAM')!;
    const fbEnqueued = result.scheduled.find((job) => job.socialAccount.platform === 'FACEBOOK')!;
    expect(igEnqueued.scheduledFor.toISOString()).toBe(igTime.toISOString());
    expect(fbEnqueued.scheduledFor.toISOString()).toBe(fbTime.toISOString());
    expect(igEnqueued.status).toBe('PENDING');
    expect(fbEnqueued.status).toBe('PENDING');
  });

  it('leaves a not-yet-ready TikTok draft (no privacy level) untouched as DRAFT, and still schedules the other ready platforms', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const igAccount = await createSocialAccount(user.id, 'INSTAGRAM');
    const tkAccount = await createSocialAccount(user.id, 'TIKTOK');
    const video = await createVideo(user.id);
    const postGroupId = `optimal-tiktok-${video.id}`;

    const igJob = await createDraftJob({ videoId: video.id, socialAccountId: igAccount.id, postGroupId });
    await prisma.publishJob.update({ where: { id: igJob.id }, data: { suggestedScheduledFor: new Date('2026-09-20T19:00:00.000Z') } });
    const tkJob = await createDraftJob({ videoId: video.id, socialAccountId: tkAccount.id, postGroupId, tiktokPrivacyLevel: null });

    const result = await enqueueDraftGroupOptimally(user.id, postGroupId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.skippedPlatforms).toEqual(['TIKTOK']);
    expect(result.scheduled).toHaveLength(1);
    expect(result.scheduled[0].socialAccount.platform).toBe('INSTAGRAM');

    // The TikTok draft must survive, untouched - not deleted, not enqueued.
    const stillDraft = await prisma.publishJob.findUniqueOrThrow({ where: { id: tkJob.id } });
    expect(stillDraft.status).toBe('DRAFT');
  });

  it('does not schedule a platform the user toggled off (excludedFromPublish), and deletes its draft same as manual publish', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const igAccount = await createSocialAccount(user.id, 'INSTAGRAM');
    const fbAccount = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    const postGroupId = `optimal-excluded-${video.id}`;

    const igJob = await createDraftJob({ videoId: video.id, socialAccountId: igAccount.id, postGroupId });
    await prisma.publishJob.update({ where: { id: igJob.id }, data: { suggestedScheduledFor: new Date('2026-09-20T19:00:00.000Z') } });
    const fbJob = await createDraftJob({ videoId: video.id, socialAccountId: fbAccount.id, postGroupId });
    await prisma.publishJob.update({ where: { id: fbJob.id }, data: { excludedFromPublish: true } });

    const result = await enqueueDraftGroupOptimally(user.id, postGroupId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.scheduled).toHaveLength(1);
    expect(result.scheduled[0].socialAccount.platform).toBe('INSTAGRAM');

    const fbAfter = await prisma.publishJob.findUnique({ where: { id: fbJob.id } });
    expect(fbAfter).toBeNull();
  });

  it('falls back to a near-future time when a ready platform somehow has no suggestion', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const igAccount = await createSocialAccount(user.id, 'INSTAGRAM');
    const video = await createVideo(user.id);
    const postGroupId = `optimal-nofallback-${video.id}`;
    await createDraftJob({ videoId: video.id, socialAccountId: igAccount.id, postGroupId });

    const result = await enqueueDraftGroupOptimally(user.id, postGroupId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.scheduled).toHaveLength(1);
    expect(result.scheduled[0].scheduledFor.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns an error for a postGroupId with no DRAFT jobs', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const result = await enqueueDraftGroupOptimally(user.id, 'nonexistent-group');
    expect(result.ok).toBe(false);
  });
});
