import { afterEach, describe, expect, it, vi } from 'vitest';
import { processDuePublishJobs } from '@/lib/server/publish-processor';
import { encrypt } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo } from '../helpers/fixtures';

// TASK-3.2.1: /pause na Telegramie ustawia User.publishingPaused - claimDuePublishJobs (rdzeń
// crona produkcyjnego, wołany przez /api/cron/publish) musi pominąć PENDING joby spauzowanego
// użytkownika, ale NIE wstrzymywać publikacji innych, niespauzowanych użytkowników w tym samym
// przebiegu - to jest per-user filtr, nie globalny wyłącznik.

const cleanupUserIds: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(cleanupUserIds.splice(0).map((id) => deleteTestUser(id)));
});

async function createDuePendingJob(userId: string, platform: 'FACEBOOK' = 'FACEBOOK') {
  const account = await createSocialAccount(userId, platform, {
    accessToken: encrypt('real-looking-access-token'),
  });
  const video = await createVideo(userId);

  return prisma.publishJob.create({
    data: {
      status: 'PENDING',
      postGroupId: `group-${userId}`,
      caption: 'caption',
      hashtags: [],
      scheduledFor: new Date(Date.now() - 1000),
      videoId: video.id,
      socialAccountId: account.id,
      // Not testing Reels-vs-Feed here - pin to FEED so this stays the plain, single-request
      // publish path (matches this test's fetch mock).
      metaPostFormat: 'FEED',
    },
  });
}

describe('claimDuePublishJobs respects per-user publishingPaused (TASK-3.2.1)', () => {
  it('does not claim a PENDING job belonging to a paused user, but does claim one belonging to a non-paused user in the same run', async () => {
    const { user: pausedUser } = await createTestUser();
    const { user: activeUser } = await createTestUser();
    cleanupUserIds.push(pausedUser.id, activeUser.id);

    await prisma.user.update({ where: { id: pausedUser.id }, data: { publishingPaused: true } });

    const pausedJob = await createDuePendingJob(pausedUser.id);
    const activeJob = await createDuePendingJob(activeUser.id);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'remote-1', post_id: 'remote-1' }), text: async () => '' }),
    );

    await processDuePublishJobs(20);

    const refreshedPaused = await prisma.publishJob.findUnique({ where: { id: pausedJob.id } });
    const refreshedActive = await prisma.publishJob.findUnique({ where: { id: activeJob.id } });

    expect(refreshedPaused?.status).toBe('PENDING');
    expect(refreshedActive?.status).toBe('SUCCESS');
  });

  it('claims the job again once the user is un-paused', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);

    await prisma.user.update({ where: { id: user.id }, data: { publishingPaused: true } });
    const job = await createDuePendingJob(user.id);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'remote-2', post_id: 'remote-2' }), text: async () => '' }),
    );

    await processDuePublishJobs(20);
    expect((await prisma.publishJob.findUnique({ where: { id: job.id } }))?.status).toBe('PENDING');

    await prisma.user.update({ where: { id: user.id }, data: { publishingPaused: false } });
    await processDuePublishJobs(20);
    expect((await prisma.publishJob.findUnique({ where: { id: job.id } }))?.status).toBe('SUCCESS');
  });
});
