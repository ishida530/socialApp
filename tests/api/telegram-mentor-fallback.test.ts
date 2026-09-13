import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);
const mockRunMentorTurn = vi.fn();

vi.mock('@/lib/server/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/telegram')>();
  return { ...actual, sendTelegramMessage: mockSendTelegramMessage };
});

vi.mock('@/lib/server/telegram-mentor-agent', () => ({
  runMentorTurn: mockRunMentorTurn,
}));

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
  mockRunMentorTurn.mockReset();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('Telegram webhook - agent-mentor fallback routing', () => {
  it('routes unrecognized free text to the mentor agent and relays its reply', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '6000000001';
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: chatId, businessDescription: 'x' } });

    mockRunMentorTurn.mockResolvedValue('Cześć! Jak mogę pomóc?');

    const response = await POST(webhookRequest(chatId, 'siema, co słychać?'));
    expect(response.status).toBe(200);

    expect(mockRunMentorTurn).toHaveBeenCalledWith(user.id, 'siema, co słychać?');
    const calls = mockSendTelegramMessage.mock.calls;
    expect(calls[0][1]).toMatch(/myślę/i);
    expect(calls.at(-1)?.[1]).toBe('Cześć! Jak mogę pomóc?');
  });

  it('does NOT invoke the mentor agent for a recognized command', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '6000000002';
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: chatId, businessDescription: 'x' } });

    const response = await POST(webhookRequest(chatId, '/status'));
    expect(response.status).toBe(200);

    expect(mockRunMentorTurn).not.toHaveBeenCalled();
  });

  it('does NOT invoke the mentor agent while an edit/schedule/onboarding session is active', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '6000000003';
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: chatId, telegramAwaitingBusinessDescription: true },
    });

    const response = await POST(webhookRequest(chatId, 'to jest odpowiedź na pytanie o profil'));
    expect(response.status).toBe(200);

    expect(mockRunMentorTurn).not.toHaveBeenCalled();
  });
});
