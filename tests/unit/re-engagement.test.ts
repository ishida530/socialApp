import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser } from '../helpers/fixtures';

// TASK-9.2 (2026-09-15) - the one-time "link your Telegram" email nudge for web-only users.
// sendTelegramLinkReminderEmail itself is mocked (it's a real Resend network call) - this file is
// about who gets picked as a candidate and that the cooldown field is set so it never repeats.

const sendTelegramLinkReminderEmail = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/mail/service', () => ({
  sendTelegramLinkReminderEmail: (...args: unknown[]) => sendTelegramLinkReminderEmail(...args),
}));

const { sendTelegramLinkReminders } = await import('@/lib/server/re-engagement');

const OLD_ENOUGH = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

let cleanupUserIds: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupUserIds.map((id) => deleteTestUser(id)));
  cleanupUserIds = [];
  sendTelegramLinkReminderEmail.mockClear();
});

describe('sendTelegramLinkReminders', () => {
  it('emails a user who signed up on web, past the grace period, with no Telegram link and no prior reminder', async () => {
    const { user } = await createTestUser({ createdAt: OLD_ENOUGH });
    cleanupUserIds.push(user.id);

    await sendTelegramLinkReminders();

    expect(sendTelegramLinkReminderEmail).toHaveBeenCalledWith(user.email, user.name);
    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.lastTelegramLinkReminderSentAt).not.toBeNull();
  });

  it('skips a user who already linked Telegram', async () => {
    const { user } = await createTestUser({ createdAt: OLD_ENOUGH });
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    await sendTelegramLinkReminders();

    expect(sendTelegramLinkReminderEmail).not.toHaveBeenCalledWith(user.email, user.name);
  });

  it('skips a user still inside the signup grace period', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);

    await sendTelegramLinkReminders();

    expect(sendTelegramLinkReminderEmail).not.toHaveBeenCalledWith(user.email, user.name);
  });

  it('never sends a second reminder to the same user', async () => {
    const { user } = await createTestUser({ createdAt: OLD_ENOUGH });
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { lastTelegramLinkReminderSentAt: new Date() } });

    await sendTelegramLinkReminders();

    expect(sendTelegramLinkReminderEmail).not.toHaveBeenCalledWith(user.email, user.name);
  });

  it('keeps going for other users when one send fails', async () => {
    const { user: failing } = await createTestUser({ createdAt: OLD_ENOUGH });
    const { user: succeeding } = await createTestUser({ createdAt: OLD_ENOUGH });
    cleanupUserIds.push(failing.id, succeeding.id);

    sendTelegramLinkReminderEmail.mockImplementationOnce(() => Promise.reject(new Error('resend down')));

    const result = await sendTelegramLinkReminders();

    expect(result.usersNotified).toBeGreaterThanOrEqual(1);
    const refreshedFailing = await prisma.user.findUniqueOrThrow({ where: { id: failing.id } });
    expect(refreshedFailing.lastTelegramLinkReminderSentAt).toBeNull();
    const refreshedSucceeding = await prisma.user.findUniqueOrThrow({ where: { id: succeeding.id } });
    expect(refreshedSucceeding.lastTelegramLinkReminderSentAt).not.toBeNull();
  });
});
