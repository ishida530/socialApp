import { afterEach, describe, expect, it } from 'vitest';
import { enqueueDraftGroup } from '@/lib/server/publish-jobs';
import { checkAndApplyFailureCircuitBreaker } from '@/lib/server/telegram-notifications';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo, createDraftJob } from '../helpers/fixtures';

// Robustness fixes (2026-09-14), both found during a security/resilience review of the Telegram
// agent's publish pipeline:
// 1. enqueueDraftGroup's DRAFT->PENDING transition wasn't guarded against a concurrent duplicate
//    call (Telegram redelivers webhooks on slow/5xx responses; a fast double-tap on "Publikuj"
//    hits the same race) - fixed with a conditional updateMany inside one interactive transaction.
// 2. No automatic circuit breaker existed - a broken integration could fail forever, silently.

const SOON = new Date(Date.now() + 60 * 60 * 1000).toISOString();

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('enqueueDraftGroup - concurrent duplicate-call guard', () => {
  it('a second concurrent enqueue for the same postGroupId loses the race cleanly, without double-enqueuing', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'INSTAGRAM');
    const video = await createVideo(user.id);
    const postGroupId = `race-${video.id}`;
    await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId });

    const [first, second] = await Promise.all([
      enqueueDraftGroup(user.id, { postGroupId, scheduledDate: SOON, targetPlatforms: ['INSTAGRAM'] }),
      enqueueDraftGroup(user.id, { postGroupId, scheduledDate: SOON, targetPlatforms: ['INSTAGRAM'] }),
    ]);

    const results = [first, second];
    const succeeded = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as { ok: false; error: string }).error).toMatch(/już opublikowany albo zaplanowany/);

    const jobs = await prisma.publishJob.findMany({ where: { postGroupId } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('PENDING');
  });

  it('a plain sequential re-enqueue attempt after the first succeeded also fails cleanly (no DRAFT left to claim)', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'INSTAGRAM');
    const video = await createVideo(user.id);
    const postGroupId = `sequential-${video.id}`;
    await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId });

    const first = await enqueueDraftGroup(user.id, { postGroupId, scheduledDate: SOON, targetPlatforms: ['INSTAGRAM'] });
    expect(first.ok).toBe(true);

    const second = await enqueueDraftGroup(user.id, { postGroupId, scheduledDate: SOON, targetPlatforms: ['INSTAGRAM'] });
    expect(second.ok).toBe(false);
  });
});

describe('checkAndApplyFailureCircuitBreaker', () => {
  async function makeTerminalJob(userId: string, status: 'SUCCESS' | 'FAILED') {
    const account = await createSocialAccount(userId, 'INSTAGRAM');
    const video = await createVideo(userId);
    return prisma.publishJob.create({
      data: {
        status,
        postGroupId: `term-${video.id}`,
        caption: 'x',
        scheduledFor: new Date(),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });
  }

  it('pauses publishing and notifies after 5 consecutive FAILED jobs', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    for (let i = 0; i < 5; i += 1) {
      await makeTerminalJob(user.id, 'FAILED');
    }

    const result = await checkAndApplyFailureCircuitBreaker(user.id);
    expect(result.paused).toBe(true);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.publishingPaused).toBe(true);
  });

  it('does not pause when a SUCCESS is mixed into the last 5 terminal jobs', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await makeTerminalJob(user.id, 'FAILED');
    await makeTerminalJob(user.id, 'FAILED');
    await makeTerminalJob(user.id, 'SUCCESS');
    await makeTerminalJob(user.id, 'FAILED');
    await makeTerminalJob(user.id, 'FAILED');

    const result = await checkAndApplyFailureCircuitBreaker(user.id);
    expect(result.paused).toBe(false);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.publishingPaused).toBe(false);
  });

  it('does not re-pause (or re-notify) a user who is already paused', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { publishingPaused: true } });

    for (let i = 0; i < 5; i += 1) {
      await makeTerminalJob(user.id, 'FAILED');
    }

    const result = await checkAndApplyFailureCircuitBreaker(user.id);
    expect(result.paused).toBe(false);
  });

  it('does nothing when there are fewer than 5 terminal jobs yet', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await makeTerminalJob(user.id, 'FAILED');
    await makeTerminalJob(user.id, 'FAILED');

    const result = await checkAndApplyFailureCircuitBreaker(user.id);
    expect(result.paused).toBe(false);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.publishingPaused).toBe(false);
  });
});
