import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', () => ({
  sendTelegramMessage: mockSendTelegramMessage,
}));

const { processDuePublishJobs } = await import('@/lib/server/publish-processor');
const { encrypt } = await import('@/lib/server/crypto');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo } = await import('../helpers/fixtures');

// TASK-3.2.2: a terminal FAILED outcome from the cron sweep - nobody is waiting in a chat for a
// direct reply here - must push a Telegram notification, not just log it.

const cleanupUserIds: string[] = [];

afterEach(async () => {
  mockSendTelegramMessage.mockClear();
  vi.unstubAllGlobals();
  await Promise.all(cleanupUserIds.splice(0).map((id) => deleteTestUser(id)));
});

describe('processDuePublishJobs notifies on terminal failure (TASK-3.2.2)', () => {
  it('sends an immediate Telegram notification when a job permanently fails, and marks notifiedAt', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    const account = await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('token') });
    const video = await createVideo(user.id);
    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: `group-${user.id}`,
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(Date.now() - 1000),
        videoId: video.id,
        socialAccountId: account.id,
        metaPostFormat: 'FEED',
      },
    });

    // A permanent Facebook permission error fails the job immediately, no retries - see
    // isPermanentFacebookPermissionError in lib/server/publish-processor.ts.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => '{"error":{"message":"no permission to publish the video","code":100}}',
      }),
    );

    await processDuePublishJobs(20);

    const refreshed = await prisma.publishJob.findUnique({ where: { id: job.id } });
    expect(refreshed?.status).toBe('FAILED');
    expect(refreshed?.notifiedAt).not.toBeNull();

    expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
    const [chatId, message] = mockSendTelegramMessage.mock.calls[0];
    expect(chatId).toBe(`chat-${user.id}`);
    expect(message).toContain(`/retry ${job.id}`);
  });
});
