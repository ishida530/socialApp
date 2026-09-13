import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/telegram')>();
  return { ...actual, sendTelegramMessage: mockSendTelegramMessage };
});

const { POST } = await import('@/app/api/telegram/webhook/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTelegramLinkCode } = await import('@/lib/server/telegram');
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

describe('Telegram business persona onboarding', () => {
  it('/start asks for a business description when the account has none yet', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const { code } = await createTelegramLinkCode(user.id);
    const chatId = '4000000001';

    const response = await POST(webhookRequest(chatId, `/start ${code}`));
    expect(response.status).toBe(200);

    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/opisz w 1-2 zdaniach/i);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.telegramAwaitingBusinessDescription).toBe(true);
  });

  it('/start skips onboarding and sends the normal welcome when businessDescription is already set', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { businessDescription: 'Jestem raperem' } });
    const { code } = await createTelegramLinkCode(user.id);
    const chatId = '4000000002';

    const response = await POST(webhookRequest(chatId, `/start ${code}`));
    expect(response.status).toBe(200);

    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/wyślij mi wideo/i);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.telegramAwaitingBusinessDescription).toBe(false);
  });

  it('a free-text reply while awaiting saves businessDescription and clears the flag', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '4000000003';
    await createTelegramLinkCode(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: chatId, telegramAwaitingBusinessDescription: true },
    });

    const response = await POST(
      webhookRequest(chatId, 'Prowadzę salon kosmetyczny, oferujemy paznokcie i rzęsy'),
    );
    expect(response.status).toBe(200);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.businessDescription).toBe('Prowadzę salon kosmetyczny, oferujemy paznokcie i rzęsy');
    expect(refreshed.telegramAwaitingBusinessDescription).toBe(false);
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/zapisane/i);
  });

  it('/skip clears the awaiting flag without setting businessDescription', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '4000000004';
    await createTelegramLinkCode(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: chatId, telegramAwaitingBusinessDescription: true },
    });

    const response = await POST(webhookRequest(chatId, '/skip'));
    expect(response.status).toBe(200);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.businessDescription).toBeNull();
    expect(refreshed.telegramAwaitingBusinessDescription).toBe(false);
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/pominięte/i);
  });

  it('a different slash command while awaiting bypasses onboarding capture and leaves the flag set', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '4000000005';
    await createTelegramLinkCode(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: chatId, telegramAwaitingBusinessDescription: true },
    });

    const response = await POST(webhookRequest(chatId, '/status'));
    expect(response.status).toBe(200);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.businessDescription).toBeNull();
    expect(refreshed.telegramAwaitingBusinessDescription).toBe(true);
    // /status's own reply, not the onboarding prompt repeated.
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Publikacje/);
  });
});
