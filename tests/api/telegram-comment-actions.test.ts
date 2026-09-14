import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// EPIC 11 Sprint 11.2 (TASK-11.2.6/11.2.8): the Wyślij / Napisz własną / Ignoruj buttons on a
// detected-comment alert, and the free-text "Napisz własną" follow-up. Same webhook-level testing
// approach as telegram-platform-toggle.test.ts.

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
let secondCleanupUserId: string | null = null;

afterEach(async () => {
  vi.unstubAllGlobals();
  mockSendTelegramMessage.mockClear();
  mockSendTelegramMessageWithButtons.mockClear();
  mockEditTelegramMessage.mockClear();
  mockAnswerTelegramCallbackQuery.mockClear();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
  if (secondCleanupUserId) {
    await deleteTestUser(secondCleanupUserId);
    secondCleanupUserId = null;
  }
});

async function makePendingComment(userId: string, suggestedReply: string | null) {
  const video = await createVideo(userId);
  const account = await createSocialAccount(userId, 'INSTAGRAM', { accessToken: encrypt('token') });
  const job = await prisma.publishJob.create({
    data: {
      status: 'SUCCESS',
      postGroupId: `group-${video.id}`,
      caption: 'x',
      hashtags: [],
      scheduledFor: new Date(),
      publishedAt: new Date(),
      remotePostId: `remote-${video.id}`,
      videoId: video.id,
      socialAccountId: account.id,
    },
  });
  return prisma.socialComment.create({
    data: {
      userId,
      publishJobId: job.id,
      platform: 'INSTAGRAM',
      externalCommentId: `ext-${job.id}`,
      authorName: 'fan',
      text: 'Ile kosztuje?',
      suggestedReply,
      status: 'PENDING',
    },
  });
}

describe('Telegram detected-comment buttons', () => {
  it('commentreply posts the suggested reply, marks REPLIED, and edits the alert message', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '6661001';
    await linkChat(user.id, chatId);
    const comment = await makePendingComment(user.id, 'Cena od 150 zł!');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-comment-reply-1',
          data: `commentreply:${comment.id}`,
          message: { chat: { id: Number(chatId) }, message_id: 42 },
        },
      }),
    );
    expect(response.status).toBe(200);

    const updated = await prisma.socialComment.findUniqueOrThrow({ where: { id: comment.id } });
    expect(updated.status).toBe('REPLIED');
    expect(mockAnswerTelegramCallbackQuery).toHaveBeenCalledWith('cbq-comment-reply-1', 'Wysłano.');
    expect(mockEditTelegramMessage).toHaveBeenCalledWith('6661001', 42, expect.stringContaining('wysłana'));
  });

  it('commentignore marks IGNORED without contacting the platform API', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '6661002';
    await linkChat(user.id, chatId);
    const comment = await makePendingComment(user.id, 'Sugestia');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-comment-ignore-1',
          data: `commentignore:${comment.id}`,
          message: { chat: { id: Number(chatId) }, message_id: 43 },
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();

    const updated = await prisma.socialComment.findUniqueOrThrow({ where: { id: comment.id } });
    expect(updated.status).toBe('IGNORED');
  });

  it('commentcustom starts the free-text session, and the next message is sent verbatim as the reply', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '6661003';
    await linkChat(user.id, chatId);
    const comment = await makePendingComment(user.id, null);

    const startResponse = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-comment-custom-1',
          data: `commentcustom:${comment.id}`,
          message: { chat: { id: Number(chatId) }, message_id: 44 },
        },
      }),
    );
    expect(startResponse.status).toBe(200);

    const linkedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(linkedUser.telegramReplyingToCommentId).toBe(comment.id);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const replyResponse = await POST(
      webhookRequest({ message: { chat: { id: Number(chatId) }, text: 'Moja własna odpowiedź na komentarz' } }),
    );
    expect(replyResponse.status).toBe(200);

    const updatedComment = await prisma.socialComment.findUniqueOrThrow({ where: { id: comment.id } });
    expect(updatedComment.status).toBe('REPLIED');
    expect(updatedComment.suggestedReply).toBe('Moja własna odpowiedź na komentarz');

    const clearedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(clearedUser.telegramReplyingToCommentId).toBeNull();

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(chatId, '✅ Odpowiedź wysłana.');
  });

  it('a slash command during an in-progress "Napisz własną" session wins over the pending reply (escape hatch)', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '6661004';
    await linkChat(user.id, chatId);
    const comment = await makePendingComment(user.id, null);
    await prisma.user.update({ where: { id: user.id }, data: { telegramReplyingToCommentId: comment.id } });

    const response = await POST(webhookRequest({ message: { chat: { id: Number(chatId) }, text: '/status' } }));
    expect(response.status).toBe(200);

    const stillPending = await prisma.socialComment.findUniqueOrThrow({ where: { id: comment.id } });
    expect(stillPending.status).toBe('PENDING');
  });

  it('rejects a comment action for a comment belonging to a different user (ownership gate)', async () => {
    const { user: owner } = await createTestUser();
    const { user: intruder } = await createTestUser();
    cleanupUserId = owner.id;
    secondCleanupUserId = intruder.id;

    const intruderChatId = '6661005';
    await linkChat(intruder.id, intruderChatId);
    const comment = await makePendingComment(owner.id, 'Sugestia');

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-comment-intruder',
          data: `commentignore:${comment.id}`,
          message: { chat: { id: Number(intruderChatId) }, message_id: 45 },
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(mockAnswerTelegramCallbackQuery).toHaveBeenCalledWith('cbq-comment-intruder', expect.stringContaining('Nie znaleziono'));

    const stillPending = await prisma.socialComment.findUniqueOrThrow({ where: { id: comment.id } });
    expect(stillPending.status).toBe('PENDING');
  });
});
