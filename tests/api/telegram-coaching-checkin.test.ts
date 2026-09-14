import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', () => ({
  sendTelegramMessage: mockSendTelegramMessage,
}));

const { sendWeeklyCoachingCheckins } = await import('@/lib/server/telegram-notifications');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo } = await import('../helpers/fixtures');

// Real coaching (2026-09-14): proactive weekly check-in, same cooldown-field pattern as the
// existing inactivity nudge / sponsorship signal - these tests mirror those test files closely.

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
const cleanupUserIds: string[] = [];

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY; // exercise the honest template fallback, not a live Claude call
});

afterEach(async () => {
  mockSendTelegramMessage.mockClear();
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  }
  await Promise.all(cleanupUserIds.splice(0).map((id) => deleteTestUser(id)));
});

async function makeSuccessJob(userId: string, daysAgo: number) {
  const account = await createSocialAccount(userId, 'TIKTOK');
  const video = await createVideo(userId);
  const publishedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return prisma.publishJob.create({
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
}

describe('sendWeeklyCoachingCheckins', () => {
  it('sends a real, data-based check-in to a user who published this week, and marks it sent', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });
    await makeSuccessJob(user.id, 2);

    const result = await sendWeeklyCoachingCheckins();

    expect(result.usersNotified).toBe(1);
    const message = mockSendTelegramMessage.mock.calls[0][1] as string;
    expect(message).toContain('Podsumowanie tygodnia');
    expect(message).toContain('1 publikacja');

    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed?.lastCoachingCheckinSentAt).not.toBeNull();
  });

  it('does not check in with a fresh account that has no activity and no goals', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    const result = await sendWeeklyCoachingCheckins();

    expect(result.usersNotified).toBe(0);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it('checks in with a fresh account that has an active goal, even with zero posts', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });
    await prisma.goal.create({ data: { userId: user.id, description: 'Opublikować pierwszy post' } });

    const result = await sendWeeklyCoachingCheckins();

    expect(result.usersNotified).toBe(1);
    expect(mockSendTelegramMessage.mock.calls[0][1]).toContain('Opublikować pierwszy post');
  });

  it('does not re-check-in a user already checked in within the cooldown window', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: `chat-${user.id}`, lastCoachingCheckinSentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    });
    await makeSuccessJob(user.id, 1);

    const result = await sendWeeklyCoachingCheckins();

    expect(result.usersNotified).toBe(0);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it('never checks in a user with no linked Telegram chat', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await makeSuccessJob(user.id, 2);

    const result = await sendWeeklyCoachingCheckins();

    expect(result.usersNotified).toBe(0);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });
});
