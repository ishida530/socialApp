import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', () => ({
  sendTelegramMessage: mockSendTelegramMessage,
}));

const { sendInactivityNudges } = await import('@/lib/server/telegram-notifications');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo } = await import('../helpers/fixtures');

// TASK-3.2.3: exact copy/threshold agreed with the product owner - 10 days without any
// PublishJob activity, one neutral message, never re-sent more often than the threshold itself.

const cleanupUserIds: string[] = [];

afterEach(async () => {
  mockSendTelegramMessage.mockClear();
  await Promise.all(cleanupUserIds.splice(0).map((id) => deleteTestUser(id)));
});

async function makeJobAt(userId: string, createdAt: Date) {
  const account = await createSocialAccount(userId, 'FACEBOOK');
  const video = await createVideo(userId);
  const job = await prisma.publishJob.create({
    data: {
      status: 'SUCCESS',
      postGroupId: `group-${video.id}`,
      caption: 'x',
      hashtags: [],
      scheduledFor: createdAt,
      videoId: video.id,
      socialAccountId: account.id,
    },
  });
  // createdAt has @default(now()) with no way to set it via create() directly - backdate it.
  return prisma.publishJob.update({ where: { id: job.id }, data: { createdAt } });
}

describe('sendInactivityNudges (TASK-3.2.3)', () => {
  it('sends the exact agreed message to a user whose last activity was over 10 days ago', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    await makeJobAt(user.id, new Date(Date.now() - 11 * 24 * 60 * 60 * 1000));

    const result = await sendInactivityNudges();

    expect(result.usersNotified).toBe(1);
    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      `chat-${user.id}`,
      'Nie było ostatnio aktywności na koncie — mam coś zaplanować, czy wszystko gra z materiałem?',
    );

    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed?.lastInactivityNudgeSentAt).not.toBeNull();
  });

  it('does not nudge a user whose last activity is within the threshold', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    await makeJobAt(user.id, new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));

    const result = await sendInactivityNudges();

    expect(result.usersNotified).toBe(0);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it('does not nudge a user who has never used the pipeline at all', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });
    // No PublishJob ever created for this user.

    const result = await sendInactivityNudges();

    expect(result.usersNotified).toBe(0);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it('does not re-nudge a user already nudged within the threshold window', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        telegramChatId: `chat-${user.id}`,
        lastInactivityNudgeSentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });
    await makeJobAt(user.id, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const result = await sendInactivityNudges();

    expect(result.usersNotified).toBe(0);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it('nudges again once the threshold has passed since the last nudge', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        telegramChatId: `chat-${user.id}`,
        lastInactivityNudgeSentAt: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000),
      },
    });
    await makeJobAt(user.id, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const result = await sendInactivityNudges();

    expect(result.usersNotified).toBe(1);
  });

  it('never nudges a user with no linked Telegram chat', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await makeJobAt(user.id, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const result = await sendInactivityNudges();

    expect(result.usersNotified).toBe(0);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });
});
