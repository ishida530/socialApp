import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// TASK-3.1.2: upload materiału przez Telegram + podgląd z przyciskami + callback_query.
// Sieciowe funkcje Telegrama są zamockowane bezpośrednio (nie przez fetch) - test-network-guard
// z TASK-1.1.1 i tak blokuje realne żądania do telegram.org, ten mock dodatkowo pozwala
// asertować DOKŁADNIE co bot by wysłał, bez parsowania ciała żądania HTTP.
const mockUploadTelegramMediaAsVideo = vi.fn();
const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);
const mockSendTelegramMessageWithButtons = vi.fn().mockResolvedValue({ messageId: 999 });
const mockEditTelegramMessage = vi.fn().mockResolvedValue(undefined);
const mockAnswerTelegramCallbackQuery = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/telegram')>();
  return {
    ...actual,
    uploadTelegramMediaAsVideo: mockUploadTelegramMediaAsVideo,
    sendTelegramMessage: mockSendTelegramMessage,
    sendTelegramMessageWithButtons: mockSendTelegramMessageWithButtons,
    editTelegramMessage: mockEditTelegramMessage,
    answerTelegramCallbackQuery: mockAnswerTelegramCallbackQuery,
  };
});

const mockBundles = new Map([
  ['INSTAGRAM', { platform: 'INSTAGRAM', title: 'IG Title', caption: 'Instagram caption', hashtags: ['#rap'] }],
]);

vi.mock('@/lib/server/composer-drafts', () => ({
  generatePlatformBundles: vi.fn().mockResolvedValue({ bundlesByPlatform: mockBundles, orchestrationWarning: null }),
}));

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
  mockUploadTelegramMediaAsVideo.mockClear();
  mockSendTelegramMessage.mockClear();
  mockSendTelegramMessageWithButtons.mockClear();
  mockEditTelegramMessage.mockClear();
  mockAnswerTelegramCallbackQuery.mockClear();

  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('POST /api/telegram/webhook — media upload (TASK-3.1.2)', () => {
  it('creates a Video + DRAFT PublishJobs and sends a preview with buttons for a linked user', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'INSTAGRAM');
    const chatId = '111222333';
    await linkChat(user.id, chatId);

    const fakeVideo = await createVideo(user.id);
    mockUploadTelegramMediaAsVideo.mockResolvedValue(fakeVideo);

    const response = await POST(
      webhookRequest({ message: { chat: { id: Number(chatId) }, video: { file_id: 'tg-file-1', file_size: 1024 } } }),
    );
    expect(response.status).toBe(200);

    expect(mockUploadTelegramMediaAsVideo).toHaveBeenCalledWith(user.id, 'tg-file-1', 'VIDEO', expect.any(String));

    const createdJobs = await prisma.publishJob.findMany({ where: { videoId: fakeVideo.id } });
    expect(createdJobs).toHaveLength(1);
    expect(createdJobs[0].caption).toBe('Instagram caption');
    expect(createdJobs[0].status).toBe('DRAFT');

    expect(mockSendTelegramMessageWithButtons).toHaveBeenCalledTimes(1);
    const [, , buttons] = mockSendTelegramMessageWithButtons.mock.calls[0];
    expect(buttons[0]).toEqual([
      { text: '✅ Publikuj', callback_data: `publish:${createdJobs[0].postGroupId}` },
      { text: '❌ Anuluj', callback_data: `cancel:${createdJobs[0].postGroupId}` },
    ]);
  });

  it('rejects a video from an unlinked chat without uploading anything', async () => {
    const response = await POST(
      webhookRequest({ message: { chat: { id: 987654321 }, video: { file_id: 'tg-file-2' } } }),
    );
    expect(response.status).toBe(200);
    expect(mockUploadTelegramMediaAsVideo).not.toHaveBeenCalled();
    expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTelegramMessage.mock.calls[0][1]).toMatch(/nie jest jeszcze połączone/);
  });

  it('rejects a file over the 20MB Telegram limit without attempting a download', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const chatId = '444555666';
    await linkChat(user.id, chatId);

    const response = await POST(
      webhookRequest({
        message: { chat: { id: Number(chatId) }, video: { file_id: 'tg-big-file', file_size: 25 * 1024 * 1024 } },
      }),
    );
    expect(response.status).toBe(200);
    expect(mockUploadTelegramMediaAsVideo).not.toHaveBeenCalled();
    expect(mockSendTelegramMessage.mock.calls[0][1]).toMatch(/za duży/);
  });
});

describe('POST /api/telegram/webhook — callback_query (TASK-3.1.2)', () => {
  it('publish: enqueues DRAFT jobs for the owner and edits the message', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'FACEBOOK', {
      accessToken: encrypt('real-looking-facebook-access-token'),
    });
    const video = await createVideo(user.id);
    const chatId = '777888999';
    await linkChat(user.id, chatId);

    const postGroupId = `group-${user.id}`;
    await prisma.publishJob.create({
      data: {
        status: 'DRAFT',
        postGroupId,
        caption: 'caption',
        hashtags: [],
        scheduledFor: new Date(),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'remote-1', post_id: 'remote-1' }),
        text: async () => '',
      }),
    );

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-1',
          data: `publish:${postGroupId}`,
          message: { chat: { id: Number(chatId) }, message_id: 42 },
        },
      }),
    );
    expect(response.status).toBe(200);

    const updatedJob = await prisma.publishJob.findFirst({ where: { postGroupId } });
    expect(updatedJob?.status).toBe('SUCCESS');

    expect(mockAnswerTelegramCallbackQuery).toHaveBeenCalled();
    expect(mockEditTelegramMessage).toHaveBeenCalledWith(chatId, 42, expect.stringContaining('Opublikowano'));

    vi.unstubAllGlobals();
  });

  it("publish: rejects a callback_query for a postGroupId that doesn't belong to the pressing chat's user", async () => {
    const { user: owner } = await createTestUser();
    const { user: intruder } = await createTestUser();
    cleanupUserId = intruder.id;

    const account = await createSocialAccount(owner.id, 'INSTAGRAM');
    const video = await createVideo(owner.id);
    const postGroupId = `group-${owner.id}`;
    await prisma.publishJob.create({
      data: {
        status: 'DRAFT',
        postGroupId,
        caption: 'caption',
        hashtags: [],
        scheduledFor: new Date(),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    const intruderChatId = '112233445';
    await linkChat(intruder.id, intruderChatId);

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-2',
          data: `publish:${postGroupId}`,
          message: { chat: { id: Number(intruderChatId) }, message_id: 43 },
        },
      }),
    );
    expect(response.status).toBe(200);

    const untouchedJob = await prisma.publishJob.findFirst({ where: { postGroupId } });
    expect(untouchedJob?.status).toBe('DRAFT');
    expect(mockEditTelegramMessage).not.toHaveBeenCalled();

    await prisma.publishJob.deleteMany({ where: { postGroupId } });
    await deleteTestUser(owner.id);
  });

  it('cancel: deletes the DRAFT jobs and edits the message', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'INSTAGRAM');
    const video = await createVideo(user.id);
    const chatId = '555000111';
    await linkChat(user.id, chatId);

    const postGroupId = `group-cancel-${user.id}`;
    await prisma.publishJob.create({
      data: {
        status: 'DRAFT',
        postGroupId,
        caption: 'caption',
        hashtags: [],
        scheduledFor: new Date(),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-3',
          data: `cancel:${postGroupId}`,
          message: { chat: { id: Number(chatId) }, message_id: 44 },
        },
      }),
    );
    expect(response.status).toBe(200);

    const remaining = await prisma.publishJob.findMany({ where: { postGroupId } });
    expect(remaining).toHaveLength(0);
    expect(mockEditTelegramMessage).toHaveBeenCalledWith(chatId, 44, expect.stringContaining('anulowany'));
  });
});
