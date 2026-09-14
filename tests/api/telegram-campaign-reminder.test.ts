import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', () => ({
  sendTelegramMessage: mockSendTelegramMessage,
}));

const { sendStaleCampaignReminders } = await import('@/lib/server/telegram-notifications');
const { startCampaign } = await import('@/lib/server/campaigns');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser } = await import('../helpers/fixtures');

// Campaigns: the "still running?" reminder for a long-active campaign, same cooldown-field
// pattern as the other nudges (inactivity, sponsorship, coaching).

const cleanupUserIds: string[] = [];

afterEach(async () => {
  mockSendTelegramMessage.mockClear();
  await Promise.all(cleanupUserIds.splice(0).map((id) => deleteTestUser(id)));
});

describe('sendStaleCampaignReminders', () => {
  it('reminds a user whose campaign has been active a long time, and marks it sent', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    const { campaign } = await startCampaign(user.id, 'Stara kampania');
    await prisma.campaign.update({ where: { id: campaign.id }, data: { startedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) } });

    const result = await sendStaleCampaignReminders();

    expect(result.usersNotified).toBe(1);
    expect(mockSendTelegramMessage).toHaveBeenCalledWith(`chat-${user.id}`, expect.stringContaining('Stara kampania'));

    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed?.lastCampaignReminderSentAt).not.toBeNull();
  });

  it('does not remind about a recently-started campaign', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });
    await startCampaign(user.id, 'Nowa kampania');

    const result = await sendStaleCampaignReminders();

    expect(result.usersNotified).toBe(0);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it('does not re-remind within the cooldown window', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: `chat-${user.id}`, lastCampaignReminderSentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    });
    const { campaign } = await startCampaign(user.id, 'Stara kampania');
    await prisma.campaign.update({ where: { id: campaign.id }, data: { startedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) } });

    const result = await sendStaleCampaignReminders();

    expect(result.usersNotified).toBe(0);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });
});
