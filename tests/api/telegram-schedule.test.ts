import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// "📅 Zaplanuj" button (2026-09-13) - the last piece of Telegram parity with the web composer's
// "Zaplanuj" option, on top of QStash precise scheduling. Same free-text-turn pattern as caption
// editing (User.telegramSchedulingPostGroupId, cleared first, slash commands always win).

const mockScheduleQStashPublish = vi.fn().mockResolvedValue('qstash-msg-telegram');
vi.mock('@/lib/server/qstash', () => ({
  scheduleQStashPublish: mockScheduleQStashPublish,
  cancelQStashMessage: vi.fn(),
}));

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);
const mockSendTelegramMessageWithButtons = vi.fn().mockResolvedValue({ messageId: 999 });
const mockAnswerTelegramCallbackQuery = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/telegram')>();
  return {
    ...actual,
    uploadTelegramMediaAsVideo: vi.fn(),
    sendTelegramMessage: mockSendTelegramMessage,
    sendTelegramMessageWithButtons: mockSendTelegramMessageWithButtons,
    editTelegramMessage: vi.fn().mockResolvedValue(undefined),
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
  mockScheduleQStashPublish.mockClear();
  mockSendTelegramMessage.mockClear();
  mockSendTelegramMessageWithButtons.mockClear();
  mockAnswerTelegramCallbackQuery.mockClear();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

async function makeDraftGroup(userId: string) {
  const video = await createVideo(userId);
  const account = await createSocialAccount(userId, 'FACEBOOK', { accessToken: encrypt('token') });
  const postGroupId = `group-${userId}`;
  const job = await prisma.publishJob.create({
    data: { status: 'DRAFT', postGroupId, caption: 'x', scheduledFor: new Date(), videoId: video.id, socialAccountId: account.id },
  });
  return { postGroupId, job };
}

describe('Telegram "📅 Zaplanuj"', () => {
  it('schedulestart opens a scheduling session and prompts for a date/time', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '7001001';
    await linkChat(user.id, chatId);
    const { postGroupId } = await makeDraftGroup(user.id);

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-sched-1',
          data: `schedulestart:${postGroupId}`,
          message: { chat: { id: Number(chatId) }, message_id: 5 },
        },
      }),
    );
    expect(response.status).toBe(200);

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.telegramSchedulingPostGroupId).toBe(postGroupId);
    expect(mockSendTelegramMessage).toHaveBeenCalledWith(chatId, expect.stringContaining('Kiedy opublikować'));
  });

  it('a valid date/time reply schedules the post (PENDING, QStash message scheduled) and clears the session', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '7001002';
    await linkChat(user.id, chatId);
    const { postGroupId, job } = await makeDraftGroup(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramSchedulingPostGroupId: postGroupId } });

    const response = await POST(webhookRequest({ message: { chat: { id: Number(chatId) }, text: 'za 30 minut' } }));
    expect(response.status).toBe(200);

    const updatedJob = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updatedJob.status).toBe('PENDING');
    expect(updatedJob.qstashMessageId).toBe('qstash-msg-telegram');
    expect(mockScheduleQStashPublish).toHaveBeenCalledWith(job.id, expect.any(Date));

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.telegramSchedulingPostGroupId).toBeNull();

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(chatId, expect.stringContaining('Zaplanowano'));
  });

  it('an unparseable reply re-prompts and keeps the scheduling session open', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '7001003';
    await linkChat(user.id, chatId);
    const { postGroupId, job } = await makeDraftGroup(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramSchedulingPostGroupId: postGroupId } });

    await POST(webhookRequest({ message: { chat: { id: Number(chatId) }, text: 'kiedyś wieczorem' } }));

    const unchangedJob = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(unchangedJob.status).toBe('DRAFT');

    const userAfter = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(userAfter.telegramSchedulingPostGroupId).toBe(postGroupId);
    expect(mockSendTelegramMessage).toHaveBeenCalledWith(chatId, expect.stringContaining('Nie rozpoznałem'));
  });

  it('a slash command during a scheduling session is handled as a command, not as a schedule reply', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '7001004';
    await linkChat(user.id, chatId);
    const { postGroupId, job } = await makeDraftGroup(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramSchedulingPostGroupId: postGroupId } });

    await POST(webhookRequest({ message: { chat: { id: Number(chatId) }, text: '/status' } }));

    const unchangedJob = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(unchangedJob.status).toBe('DRAFT');

    const userAfter = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(userAfter.telegramSchedulingPostGroupId).toBe(postGroupId);
  });
});
