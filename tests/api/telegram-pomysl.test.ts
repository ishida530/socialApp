import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);
const mockGenerateContentIdeas = vi.fn();

vi.mock('@/lib/server/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/telegram')>();
  return { ...actual, sendTelegramMessage: mockSendTelegramMessage };
});

vi.mock('@/lib/server/telegram-content-ideas', () => ({
  generateContentIdeas: mockGenerateContentIdeas,
}));

const { POST } = await import('@/app/api/telegram/webhook/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo } = await import('../helpers/fixtures');

const WEBHOOK_URL = 'http://localhost:3000/api/telegram/webhook';
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET as string;

function webhookRequest(chatId: string, text: string) {
  return new NextRequest(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
    body: JSON.stringify({ message: { chat: { id: Number(chatId) }, text } }),
  });
}

async function linkChat(userId: string, chatId: string) {
  await prisma.user.update({ where: { id: userId }, data: { telegramChatId: chatId } });
}

async function makeSuccessPost(userId: string) {
  const account = await createSocialAccount(userId, 'TIKTOK');
  const video = await createVideo(userId);
  return prisma.publishJob.create({
    data: {
      status: 'SUCCESS',
      postGroupId: `group-${video.id}`,
      caption: 'caption',
      hashtags: ['rap'],
      scheduledFor: new Date(),
      publishedAt: new Date(),
      videoId: video.id,
      socialAccountId: account.id,
    },
  });
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  mockSendTelegramMessage.mockClear();
  mockGenerateContentIdeas.mockReset();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('/pomysl', () => {
  it('asks for more material instead of calling Claude when fewer than 2 posts exist', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '5000000001';
    await linkChat(user.id, chatId);
    await makeSuccessPost(user.id);

    const response = await POST(webhookRequest(chatId, '/pomysl'));
    expect(response.status).toBe(200);

    expect(mockGenerateContentIdeas).not.toHaveBeenCalled();
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/za mało/i);
  });

  it('sends an ack, then the formatted ideas, grounded in recent posts and businessDescription', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '5000000002';
    await linkChat(user.id, chatId);
    await prisma.user.update({ where: { id: user.id }, data: { businessDescription: 'Jestem raperem' } });
    await makeSuccessPost(user.id);
    await makeSuccessPost(user.id);

    mockGenerateContentIdeas.mockResolvedValue([
      { title: 'Pomysł 1', description: 'Opis pierwszego pomysłu.' },
      { title: 'Pomysł 2', description: 'Opis drugiego pomysłu.' },
    ]);

    const response = await POST(webhookRequest(chatId, '/pomysl'));
    expect(response.status).toBe(200);

    expect(mockGenerateContentIdeas).toHaveBeenCalledWith('Jestem raperem', expect.any(Array));
    const calls = mockSendTelegramMessage.mock.calls;
    expect(calls[0][1]).toMatch(/Analizuję/i);
    const finalMessage = calls.at(-1)?.[1] as string;
    expect(finalMessage).toContain('Pomysł 1');
    expect(finalMessage).toContain('Pomysł 2');
  });

  it('tells the user generation failed rather than staying silent when Claude returns null', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '5000000003';
    await linkChat(user.id, chatId);
    await makeSuccessPost(user.id);
    await makeSuccessPost(user.id);

    mockGenerateContentIdeas.mockResolvedValue(null);

    const response = await POST(webhookRequest(chatId, '/pomysl'));
    expect(response.status).toBe(200);

    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/nie udało się/i);
  });
});
