import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', () => ({
  sendTelegramMessage: mockSendTelegramMessage,
}));

const { sendSponsorshipSignals } = await import('@/lib/server/telegram-notifications');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo } = await import('../helpers/fixtures');

// TASK-5.4.3 (Agent sponsoringu): rzadki sygnał gdy zasięg realnie rośnie, oparty na PostMetric
// (EPIC 4) - nie pełny agent przygotowujący wycenę (appka nie ma danych o realnych stawkach).

const cleanupUserIds: string[] = [];

afterEach(async () => {
  mockSendTelegramMessage.mockClear();
  await Promise.all(cleanupUserIds.splice(0).map((id) => deleteTestUser(id)));
});

async function makeMetric(userId: string, daysAgo: number, views: number) {
  const account = await createSocialAccount(userId, 'TIKTOK');
  const video = await createVideo(userId);
  const publishedAt = new Date();
  publishedAt.setUTCDate(publishedAt.getUTCDate() - daysAgo);
  const job = await prisma.publishJob.create({
    data: {
      status: 'SUCCESS',
      postGroupId: `group-${video.id}`,
      caption: 'x',
      hashtags: [],
      scheduledFor: publishedAt,
      publishedAt,
      remotePostId: `remote-${video.id}`,
      videoId: video.id,
      socialAccountId: account.id,
    },
  });
  await prisma.postMetric.create({ data: { publishJobId: job.id, views, likes: 0, comments: 0, shares: 0 } });
}

describe('sendSponsorshipSignals (TASK-5.4.3)', () => {
  it('sends a growth signal to a user whose reach genuinely grew, and marks it sent', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    await makeMetric(user.id, 45, 1000);
    await makeMetric(user.id, 5, 3000);

    const result = await sendSponsorshipSignals();

    expect(result.usersNotified).toBe(1);
    expect(mockSendTelegramMessage).toHaveBeenCalledWith(`chat-${user.id}`, expect.stringContaining('3000'));

    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed?.lastSponsorshipSignalSentAt).not.toBeNull();
  });

  it('does not signal a user whose reach did not meaningfully grow', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    await makeMetric(user.id, 45, 5000);
    await makeMetric(user.id, 5, 5100);

    const result = await sendSponsorshipSignals();

    expect(result.usersNotified).toBe(0);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it('does not re-signal a user already signaled within the cooldown window', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: `chat-${user.id}`, lastSponsorshipSignalSentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    });

    await makeMetric(user.id, 45, 1000);
    await makeMetric(user.id, 5, 3000);

    const result = await sendSponsorshipSignals();

    expect(result.usersNotified).toBe(0);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it('never signals a user with no linked Telegram chat', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);

    await makeMetric(user.id, 45, 1000);
    await makeMetric(user.id, 5, 3000);

    const result = await sendSponsorshipSignals();

    expect(result.usersNotified).toBe(0);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });
});
