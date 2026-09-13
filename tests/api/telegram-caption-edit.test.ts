import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// New feature (2026-09-13): user asked to review/edit AI-generated title/caption/hashtags via
// Telegram itself before approving, instead of only being able to fix them in the web composer.
// "✏️ Edytuj" on the preview message starts a free-text edit turn (User.telegramEditingJobId),
// parsed by lib/server/telegram-edit-parser.ts, and re-sends the preview once applied.

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);
const mockSendTelegramMessageWithButtons = vi.fn().mockResolvedValue({ messageId: 999 });
const mockEditTelegramMessage = vi.fn().mockResolvedValue(undefined);
const mockAnswerTelegramCallbackQuery = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/telegram')>();
  return {
    ...actual,
    uploadTelegramMediaAsVideo: vi.fn(),
    sendTelegramMessage: mockSendTelegramMessage,
    sendTelegramMessageWithButtons: mockSendTelegramMessageWithButtons,
    editTelegramMessage: mockEditTelegramMessage,
    answerTelegramCallbackQuery: mockAnswerTelegramCallbackQuery,
  };
});

const { POST } = await import('@/app/api/telegram/webhook/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTelegramLinkCode } = await import('@/lib/server/telegram');
const { encrypt } = await import('@/lib/server/crypto');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo } = await import('../helpers/fixtures');

const WEBHOOK_URL = 'http://localhost:3000/api/telegram/webhook';
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET as string;

function webhookRequest(body: unknown) {
  return new NextRequest(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
    body: JSON.stringify(body),
  });
}

async function linkChat(userId: string, chatId: string) {
  const { code } = await createTelegramLinkCode(userId);
  await prisma.user.update({ where: { id: userId }, data: { telegramChatId: chatId } });
  return code;
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  mockSendTelegramMessage.mockClear();
  mockSendTelegramMessageWithButtons.mockClear();
  mockEditTelegramMessage.mockClear();
  mockAnswerTelegramCallbackQuery.mockClear();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

async function makeDraftJob(userId: string, platform: 'INSTAGRAM' | 'YOUTUBE' = 'INSTAGRAM') {
  const video = await createVideo(userId);
  const account = await createSocialAccount(userId, platform, { accessToken: encrypt('token') });
  const postGroupId = `group-${userId}`;

  const job = await prisma.publishJob.create({
    data: {
      status: 'DRAFT',
      postGroupId,
      caption: 'stary opis',
      hashtags: ['stary'],
      title: platform === 'YOUTUBE' ? 'Stary tytul' : null,
      scheduledFor: new Date(),
      videoId: video.id,
      socialAccountId: account.id,
    },
  });

  return { postGroupId, job };
}

describe('Telegram caption/hashtag/title edit', () => {
  it('editstart callback opens an edit session and prompts with current content', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '6001001';
    await linkChat(user.id, chatId);
    const { postGroupId } = await makeDraftJob(user.id, 'INSTAGRAM');

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-edit-1',
          data: `editstart:${postGroupId}:INSTAGRAM`,
          message: { chat: { id: Number(chatId) }, message_id: 5 },
        },
      }),
    );
    expect(response.status).toBe(200);

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.telegramEditingJobId).toBeTruthy();

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('stary opis'),
    );
  });

  it('a free-text reply during an edit session updates the job and clears the session', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '6001002';
    await linkChat(user.id, chatId);
    const { job } = await makeDraftJob(user.id, 'INSTAGRAM');

    await prisma.user.update({ where: { id: user.id }, data: { telegramEditingJobId: job.id } });

    const response = await POST(
      webhookRequest({
        message: {
          chat: { id: Number(chatId) },
          text: 'Nowy swietny opis premiery #rap #nowość',
        },
      }),
    );
    expect(response.status).toBe(200);

    const updatedJob = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updatedJob.caption).toBe('Nowy swietny opis premiery');
    expect(updatedJob.hashtags).toEqual(['rap', 'nowość']);

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.telegramEditingJobId).toBeNull();

    // Confirmation + fresh preview both sent.
    expect(mockSendTelegramMessage).toHaveBeenCalledWith(chatId, expect.stringContaining('Zaktualizowano'));
    expect(mockSendTelegramMessageWithButtons).toHaveBeenCalled();
  });

  it('a slash command during an edit session is handled as a command, not as edit content', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '6001003';
    await linkChat(user.id, chatId);
    const { job } = await makeDraftJob(user.id, 'INSTAGRAM');

    await prisma.user.update({ where: { id: user.id }, data: { telegramEditingJobId: job.id } });

    await POST(webhookRequest({ message: { chat: { id: Number(chatId) }, text: '/status' } }));

    const unchangedJob = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(unchangedJob.caption).toBe('stary opis');

    const userAfter = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(userAfter.telegramEditingJobId).toBe(job.id);
  });

  it('YouTube: a multi-line reply updates title, caption, and hashtags together', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '6001004';
    await linkChat(user.id, chatId);
    const { job } = await makeDraftJob(user.id, 'YOUTUBE');

    await prisma.user.update({ where: { id: user.id }, data: { telegramEditingJobId: job.id } });

    await POST(
      webhookRequest({
        message: {
          chat: { id: Number(chatId) },
          text: 'Nowy tytul odcinka\nOpis odcinka o mieście #shorts #vlog',
        },
      }),
    );

    const updatedJob = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updatedJob.title).toBe('Nowy tytul odcinka');
    expect(updatedJob.caption).toBe('Opis odcinka o mieście');
    expect(updatedJob.hashtags).toEqual(['shorts', 'vlog']);
  });

  it('a stale job (already published) is handled gracefully, clearing the session', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '6001005';
    await linkChat(user.id, chatId);
    const { job } = await makeDraftJob(user.id, 'INSTAGRAM');

    await prisma.publishJob.update({ where: { id: job.id }, data: { status: 'SUCCESS' } });
    await prisma.user.update({ where: { id: user.id }, data: { telegramEditingJobId: job.id } });

    const response = await POST(
      webhookRequest({ message: { chat: { id: Number(chatId) }, text: 'próba edycji spóźniona' } }),
    );
    expect(response.status).toBe(200);

    const userAfter = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(userAfter.telegramEditingJobId).toBeNull();
    expect(mockSendTelegramMessage).toHaveBeenCalledWith(chatId, expect.stringContaining('nie jest już dostępny'));
  });
});
