import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', () => ({
  sendTelegramMessage: mockSendTelegramMessage,
}));

const { notifyJobFailedImmediately, sendMorningDigest } = await import('@/lib/server/telegram-notifications');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo } = await import('../helpers/fixtures');

// TASK-3.2.2: proactive notifications - FAILED jobs notified immediately (never batched),
// SUCCESS jobs batched into one digest message per user regardless of how many posts went out.

const cleanupUserIds: string[] = [];

afterEach(async () => {
  mockSendTelegramMessage.mockClear();
  await Promise.all(cleanupUserIds.splice(0).map((id) => deleteTestUser(id)));
});

async function makeJob(userId: string, status: 'SUCCESS' | 'FAILED', overrides: { remotePostUrl?: string; errorMessage?: string } = {}) {
  const account = await createSocialAccount(userId, 'FACEBOOK');
  const video = await createVideo(userId);
  return prisma.publishJob.create({
    data: {
      status,
      postGroupId: `group-${video.id}`,
      caption: 'x',
      hashtags: [],
      scheduledFor: new Date(),
      videoId: video.id,
      socialAccountId: account.id,
      publishedAt: status === 'SUCCESS' ? new Date() : null,
      remotePostUrl: overrides.remotePostUrl ?? null,
      errorMessage: overrides.errorMessage ?? null,
    },
  });
}

describe('notifyJobFailedImmediately', () => {
  it('sends a message and marks notifiedAt for a FAILED job with a linked Telegram chat', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    const job = await makeJob(user.id, 'FAILED', { errorMessage: 'token expired' });

    await notifyJobFailedImmediately(job.id);

    expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
    const [chatId, message] = mockSendTelegramMessage.mock.calls[0];
    expect(chatId).toBe(`chat-${user.id}`);
    expect(message).toContain('token expired');
    expect(message).toContain(`/retry ${job.id}`);

    expect((await prisma.publishJob.findUnique({ where: { id: job.id } }))?.notifiedAt).not.toBeNull();
  });

  it('marks notifiedAt without sending anything for a job with no linked Telegram chat', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);

    const job = await makeJob(user.id, 'FAILED', { errorMessage: 'token expired' });

    await notifyJobFailedImmediately(job.id);

    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
    expect((await prisma.publishJob.findUnique({ where: { id: job.id } }))?.notifiedAt).not.toBeNull();
  });

  it('is a no-op for a job already notified', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    const job = await makeJob(user.id, 'FAILED');
    await prisma.publishJob.update({ where: { id: job.id }, data: { notifiedAt: new Date() } });

    await notifyJobFailedImmediately(job.id);

    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });
});

describe('sendMorningDigest', () => {
  it('batches multiple SUCCESS jobs for the same user into exactly one message', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    const jobA = await makeJob(user.id, 'SUCCESS', { remotePostUrl: 'https://facebook.com/posts/a' });
    const jobB = await makeJob(user.id, 'SUCCESS', { remotePostUrl: 'https://facebook.com/posts/b' });

    const result = await sendMorningDigest();

    expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
    const [, message] = mockSendTelegramMessage.mock.calls[0];
    expect(message).toContain('https://facebook.com/posts/a');
    expect(message).toContain('https://facebook.com/posts/b');
    expect(result).toEqual({ usersNotified: 1, jobsNotified: 2 });

    expect((await prisma.publishJob.findUnique({ where: { id: jobA.id } }))?.notifiedAt).not.toBeNull();
    expect((await prisma.publishJob.findUnique({ where: { id: jobB.id } }))?.notifiedAt).not.toBeNull();
  });

  it('sends separate messages to separate users, and skips users with no linked chat', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    const { user: userC } = await createTestUser();
    cleanupUserIds.push(userA.id, userB.id, userC.id);
    await prisma.user.update({ where: { id: userA.id }, data: { telegramChatId: `chat-${userA.id}` } });
    await prisma.user.update({ where: { id: userB.id }, data: { telegramChatId: `chat-${userB.id}` } });
    // userC has no telegramChatId - must be silently skipped, not an error.

    await makeJob(userA.id, 'SUCCESS');
    await makeJob(userB.id, 'SUCCESS');
    await makeJob(userC.id, 'SUCCESS');

    const result = await sendMorningDigest();

    expect(mockSendTelegramMessage).toHaveBeenCalledTimes(2);
    expect(result.usersNotified).toBe(2);
    expect(result.jobsNotified).toBe(2);
  });

  it('does not re-notify a job whose notifiedAt is already set', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    const job = await makeJob(user.id, 'SUCCESS');
    await prisma.publishJob.update({ where: { id: job.id }, data: { notifiedAt: new Date() } });

    const result = await sendMorningDigest();

    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
    expect(result).toEqual({ usersNotified: 0, jobsNotified: 0 });
  });

  it('does not mark notifiedAt if the Telegram send itself fails - next sweep retries', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    const job = await makeJob(user.id, 'SUCCESS');
    mockSendTelegramMessage.mockRejectedValueOnce(new Error('Telegram API down'));

    const result = await sendMorningDigest();

    expect(result).toEqual({ usersNotified: 0, jobsNotified: 0 });
    expect((await prisma.publishJob.findUnique({ where: { id: job.id } }))?.notifiedAt).toBeNull();
  });
});
