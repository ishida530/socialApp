import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Proactive content suggestions (2026-09-14): end-to-end check that a suggestion created by
// sendContentSuggestions (lib/server/telegram-notifications.ts) can actually be approved through
// the EXISTING, unmodified "publish"/"cancel"/"editstart" callback handlers in the Telegram
// webhook - by design, no new callback-handling code was added for this feature, it reuses the
// same generic DRAFT-PublishJob machinery as a normal media upload.

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);
const mockEditTelegramMessage = vi.fn().mockResolvedValue(undefined);
const mockAnswerTelegramCallbackQuery = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/telegram')>();
  return {
    ...actual,
    sendTelegramMessage: mockSendTelegramMessage,
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
  vi.unstubAllGlobals();
  mockSendTelegramMessage.mockClear();
  mockEditTelegramMessage.mockClear();
  mockAnswerTelegramCallbackQuery.mockClear();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('approving a proactive content suggestion', () => {
  it('tapping ✅ Publikuj on a suggested text post actually posts to the Facebook /feed endpoint', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '888001';
    await linkChat(user.id, chatId);
    const account = await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('token') });

    // Mirrors exactly what sendContentSuggestions creates (lib/server/telegram-notifications.ts).
    const video = await createVideo(user.id, { mediaType: 'TEXT', sourceUrl: 'text-post://no-media', title: 'Sugestia' });
    const postGroupId = `suggestion-${video.id}`;
    await prisma.publishJob.create({
      data: {
        status: 'DRAFT',
        postGroupId,
        caption: 'Świetny tydzień za nami! A jak wam minął?',
        scheduledFor: new Date(),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'fb-post-suggestion-1' }), text: async () => '' }));

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-suggestion-publish',
          data: `publish:${postGroupId}`,
          message: { chat: { id: Number(chatId) }, message_id: 71 },
        },
      }),
    );
    expect(response.status).toBe(200);

    const job = await prisma.publishJob.findFirstOrThrow({ where: { postGroupId } });
    expect(job.status).toBe('SUCCESS');
    expect(job.remotePostUrl).toContain('facebook.com');
  });

  it('tapping 🚫 Odrzuć discards the suggested draft without publishing anything', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '888002';
    await linkChat(user.id, chatId);
    const account = await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('token') });

    const video = await createVideo(user.id, { mediaType: 'TEXT', sourceUrl: 'text-post://no-media' });
    const postGroupId = `suggestion-reject-${video.id}`;
    await prisma.publishJob.create({
      data: { status: 'DRAFT', postGroupId, caption: 'x', scheduledFor: new Date(), videoId: video.id, socialAccountId: account.id },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-suggestion-reject',
          data: `cancel:${postGroupId}`,
          message: { chat: { id: Number(chatId) }, message_id: 72 },
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();

    const remaining = await prisma.publishJob.findMany({ where: { postGroupId } });
    expect(remaining).toHaveLength(0);
  });
});
