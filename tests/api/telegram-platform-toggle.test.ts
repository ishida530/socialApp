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

describe('Telegram preview Reels/Feed format toggle', () => {
  it('flips metaPostFormat REELS -> FEED, persists it as the account sticky default, and updates the message', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '5551005';
    await linkChat(user.id, chatId);
    const { postGroupId, igJob } = await makeDraftGroup(user.id);
    await prisma.publishJob.update({ where: { id: igJob.id }, data: { metaPostFormat: 'REELS' } });

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-format-1',
          data: `formattoggle:${postGroupId}:INSTAGRAM`,
          message: { chat: { id: Number(chatId) }, message_id: 7 },
        },
      }),
    );
    expect(response.status).toBe(200);

    const updatedJob = await prisma.publishJob.findUniqueOrThrow({ where: { id: igJob.id } });
    expect(updatedJob.metaPostFormat).toBe('FEED');

    const account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: updatedJob.socialAccountId } });
    expect(account.lastMetaPostFormat).toBe('FEED');

    expect(mockAnswerTelegramCallbackQuery).toHaveBeenCalledWith('cbq-format-1', expect.stringContaining('zwykły post'));

    const [, , text, buttons] = mockEditTelegramMessage.mock.calls[0];
    expect(text).toContain('INSTAGRAM — zwykły post');
    expect(buttons.flat()).toContainEqual({ text: '📋 Zwykły post', callback_data: `formattoggle:${postGroupId}:INSTAGRAM` });
  });

  it('toggling back returns to REELS', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '5551006';
    await linkChat(user.id, chatId);
    const { postGroupId, igJob } = await makeDraftGroup(user.id);
    await prisma.publishJob.update({ where: { id: igJob.id }, data: { metaPostFormat: 'FEED' } });

    await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-format-2',
          data: `formattoggle:${postGroupId}:INSTAGRAM`,
          message: { chat: { id: Number(chatId) }, message_id: 7 },
        },
      }),
    );

    const updatedJob = await prisma.publishJob.findUniqueOrThrow({ where: { id: igJob.id } });
    expect(updatedJob.metaPostFormat).toBe('REELS');
  });

  it('is not offered for TikTok (no formattoggle button) and rejects the action defensively if forced', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '5551007';
    await linkChat(user.id, chatId);
    const { postGroupId, tkJob } = await makeDraftGroup(user.id);

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-format-3',
          data: `formattoggle:${postGroupId}:TIKTOK`,
          message: { chat: { id: Number(chatId) }, message_id: 7 },
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(mockAnswerTelegramCallbackQuery).toHaveBeenCalledWith('cbq-format-3', expect.stringContaining('Nieprawidłowa'));

    const unchangedJob = await prisma.publishJob.findUniqueOrThrow({ where: { id: tkJob.id } });
    expect(unchangedJob.metaPostFormat).toBeNull();
  });

  it('Facebook cycles through all three states (REELS -> FEED -> BOTH -> REELS); Instagram never reaches BOTH', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '5551008';
    await linkChat(user.id, chatId);

    const video = await createVideo(user.id);
    const fbAccount = await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('token') });
    const igAccount = await createSocialAccount(user.id, 'INSTAGRAM', { accessToken: encrypt('token') });
    const postGroupId = `group-fb-${user.id}`;
    const fbJob = await prisma.publishJob.create({
      data: {
        status: 'DRAFT',
        postGroupId,
        caption: 'fb',
        scheduledFor: new Date(),
        videoId: video.id,
        socialAccountId: fbAccount.id,
        metaPostFormat: 'REELS',
      },
    });
    const igJob = await prisma.publishJob.create({
      data: {
        status: 'DRAFT',
        postGroupId,
        caption: 'ig',
        scheduledFor: new Date(),
        videoId: video.id,
        socialAccountId: igAccount.id,
        metaPostFormat: 'REELS',
      },
    });

    const toggleFb = () =>
      POST(
        webhookRequest({
          callback_query: {
            id: 'cbq-fb-cycle',
            data: `formattoggle:${postGroupId}:FACEBOOK`,
            message: { chat: { id: Number(chatId) }, message_id: 7 },
          },
        }),
      );
    const toggleIg = () =>
      POST(
        webhookRequest({
          callback_query: {
            id: 'cbq-ig-cycle',
            data: `formattoggle:${postGroupId}:INSTAGRAM`,
            message: { chat: { id: Number(chatId) }, message_id: 7 },
          },
        }),
      );

    await toggleFb();
    expect((await prisma.publishJob.findUniqueOrThrow({ where: { id: fbJob.id } })).metaPostFormat).toBe('FEED');
    await toggleFb();
    expect((await prisma.publishJob.findUniqueOrThrow({ where: { id: fbJob.id } })).metaPostFormat).toBe('BOTH');
    await toggleFb();
    expect((await prisma.publishJob.findUniqueOrThrow({ where: { id: fbJob.id } })).metaPostFormat).toBe('REELS');

    await toggleIg();
    expect((await prisma.publishJob.findUniqueOrThrow({ where: { id: igJob.id } })).metaPostFormat).toBe('FEED');
    await toggleIg();
    expect((await prisma.publishJob.findUniqueOrThrow({ where: { id: igJob.id } })).metaPostFormat).toBe('REELS');
  });
});
