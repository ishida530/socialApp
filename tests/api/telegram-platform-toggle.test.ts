import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// New feature (2026-09-13, consultation following a real-usage question about Telegram's
// "pelny punkt kontroli" claim): the preview message's inline keyboard previously offered only
// Publikuj/Anuluj - no way to skip a single platform for one post without going to the web UI.
// This adds a toggle button per platform that edits the same message in place (same "1
// wiadomosc = 1 decyzja" pattern), backed by PublishJob.excludedFromPublish.

const mockSendTelegramMessageWithButtons = vi.fn().mockResolvedValue({ messageId: 999 });
const mockEditTelegramMessage = vi.fn().mockResolvedValue(undefined);
const mockAnswerTelegramCallbackQuery = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/telegram')>();
  return {
    ...actual,
    uploadTelegramMediaAsVideo: vi.fn(),
    sendTelegramMessage: vi.fn().mockResolvedValue(undefined),
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
  vi.unstubAllGlobals();
  mockSendTelegramMessageWithButtons.mockClear();
  mockEditTelegramMessage.mockClear();
  mockAnswerTelegramCallbackQuery.mockClear();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

async function makeDraftGroup(userId: string) {
  const video = await createVideo(userId);
  const igAccount = await createSocialAccount(userId, 'INSTAGRAM', { accessToken: encrypt('token') });
  const tkAccount = await createSocialAccount(userId, 'TIKTOK', { accessToken: encrypt('token') });
  const postGroupId = `group-${userId}`;

  const igJob = await prisma.publishJob.create({
    data: { status: 'DRAFT', postGroupId, caption: 'ig', scheduledFor: new Date(), videoId: video.id, socialAccountId: igAccount.id },
  });
  const tkJob = await prisma.publishJob.create({
    data: {
      status: 'DRAFT',
      postGroupId,
      caption: 'tk',
      scheduledFor: new Date(),
      videoId: video.id,
      socialAccountId: tkAccount.id,
      tiktokPrivacyLevel: 'SELF_ONLY',
    },
  });

  return { postGroupId, igJob, tkJob };
}

describe('Telegram preview platform toggle', () => {
  it('flips excludedFromPublish and edits the message with updated button state', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '5551001';
    await linkChat(user.id, chatId);
    const { postGroupId, igJob } = await makeDraftGroup(user.id);

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-toggle-1',
          data: `toggle:${postGroupId}:INSTAGRAM`,
          message: { chat: { id: Number(chatId) }, message_id: 7 },
        },
      }),
    );
    expect(response.status).toBe(200);

    const updatedIgJob = await prisma.publishJob.findUniqueOrThrow({ where: { id: igJob.id } });
    expect(updatedIgJob.excludedFromPublish).toBe(true);

    expect(mockAnswerTelegramCallbackQuery).toHaveBeenCalledWith('cbq-toggle-1', expect.stringContaining('Pominięto'));

    const [, , text, buttons] = mockEditTelegramMessage.mock.calls[0];
    expect(text).toContain('TIKTOK');
    expect(text).not.toMatch(/Publikacja pójdzie na:.*INSTAGRAM/);
    const flatButtons = buttons.flat();
    expect(flatButtons).toContainEqual({ text: '☐ INSTAGRAM', callback_data: `toggle:${postGroupId}:INSTAGRAM` });
    expect(flatButtons).toContainEqual({ text: '✅ TIKTOK', callback_data: `toggle:${postGroupId}:TIKTOK` });
  });

  it('toggling twice returns to included', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '5551002';
    await linkChat(user.id, chatId);
    const { postGroupId, igJob } = await makeDraftGroup(user.id);

    const toggleRequest = () =>
      POST(
        webhookRequest({
          callback_query: {
            id: 'cbq-toggle-2',
            data: `toggle:${postGroupId}:INSTAGRAM`,
            message: { chat: { id: Number(chatId) }, message_id: 7 },
          },
        }),
      );

    await toggleRequest();
    await toggleRequest();

    const finalJob = await prisma.publishJob.findUniqueOrThrow({ where: { id: igJob.id } });
    expect(finalJob.excludedFromPublish).toBe(false);
    expect(mockAnswerTelegramCallbackQuery).toHaveBeenLastCalledWith('cbq-toggle-2', expect.stringContaining('z powrotem'));
  });

  it('publish excludes a toggled-off platform and deletes its draft, keeping the rest', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '5551003';
    await linkChat(user.id, chatId);
    const { postGroupId, igJob, tkJob } = await makeDraftGroup(user.id);

    await prisma.publishJob.update({ where: { id: igJob.id }, data: { excludedFromPublish: true } });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '',
        json: async () => ({ data: { publish_id: 'pub-1' } }),
      }),
    );

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-publish-1',
          data: `publish:${postGroupId}`,
          message: { chat: { id: Number(chatId) }, message_id: 7 },
        },
      }),
    );
    expect(response.status).toBe(200);

    const remainingIg = await prisma.publishJob.findUnique({ where: { id: igJob.id } });
    expect(remainingIg).toBeNull();

    const tkAfter = await prisma.publishJob.findUniqueOrThrow({ where: { id: tkJob.id } });
    expect(tkAfter.status).not.toBe('DRAFT');
  });

  it('refuses to publish when every platform is toggled off', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '5551004';
    await linkChat(user.id, chatId);
    const { postGroupId, igJob, tkJob } = await makeDraftGroup(user.id);

    await prisma.publishJob.updateMany({ where: { postGroupId }, data: { excludedFromPublish: true } });

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-publish-none',
          data: `publish:${postGroupId}`,
          message: { chat: { id: Number(chatId) }, message_id: 7 },
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(mockAnswerTelegramCallbackQuery).toHaveBeenCalledWith('cbq-publish-none', expect.stringContaining('odznaczone'));

    const igStill = await prisma.publishJob.findUniqueOrThrow({ where: { id: igJob.id } });
    const tkStill = await prisma.publishJob.findUniqueOrThrow({ where: { id: tkJob.id } });
    expect(igStill.status).toBe('DRAFT');
    expect(tkStill.status).toBe('DRAFT');
  });
});
