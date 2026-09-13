import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/telegram')>();
  return { ...actual, sendTelegramMessage: mockSendTelegramMessage };
});

const { POST } = await import('@/app/api/telegram/webhook/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser } = await import('../helpers/fixtures');

const WEBHOOK_URL = 'http://localhost:3000/api/telegram/webhook';
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET as string;

function webhookRequest(chatId: string, text: string) {
  return new NextRequest(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
    body: JSON.stringify({ message: { chat: { id: Number(chatId) }, text } }),
  });
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  mockSendTelegramMessage.mockClear();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

// The Telegram webhook is the one entry point in this app that previously had NO rate limiting
// at all (every mutating web API route already does) - a real gap given the agent-mentor now
// turns unrecognized free text into paid Claude calls with no other brake on message volume.

describe('Telegram webhook rate limiting', () => {
  it('blocks a chat once it exceeds the per-window limit, with an explicit notice', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '7000000001';
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: chatId } });

    for (let i = 0; i < 30; i += 1) {
      const response = await POST(webhookRequest(chatId, '/status'));
      expect(response.status).toBe(200);
    }

    mockSendTelegramMessage.mockClear();

    const blockedResponse = await POST(webhookRequest(chatId, '/status'));
    expect(blockedResponse.status).toBe(200);
    expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTelegramMessage.mock.calls[0][1]).toMatch(/zbyt wiele/i);
  });

  it('does not let one chat exceeding its limit affect a different chat', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    const chatIdA = '7000000002';
    const chatIdB = '7000000003';
    await prisma.user.update({ where: { id: userA.id }, data: { telegramChatId: chatIdA } });
    await prisma.user.update({ where: { id: userB.id }, data: { telegramChatId: chatIdB } });

    try {
      for (let i = 0; i < 31; i += 1) {
        await POST(webhookRequest(chatIdA, '/status'));
      }

      mockSendTelegramMessage.mockClear();
      const response = await POST(webhookRequest(chatIdB, '/status'));

      expect(response.status).toBe(200);
      expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
      expect(mockSendTelegramMessage.mock.calls[0][1]).not.toMatch(/zbyt wiele/i);
    } finally {
      await deleteTestUser(userA.id);
      await deleteTestUser(userB.id);
    }
  });
});
