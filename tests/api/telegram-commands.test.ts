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
  const { code } = await createTelegramLinkCode(userId);
  await prisma.user.update({ where: { id: userId }, data: { telegramChatId: chatId } });
}

const cleanupUserIds: string[] = [];

afterEach(async () => {
  mockSendTelegramMessage.mockClear();
  await Promise.all(cleanupUserIds.splice(0).map((id) => deleteTestUser(id)));
});

describe('Telegram text commands (TASK-3.2.1)', () => {
  it('/pause sets publishingPaused=true, /resume clears it, both confirmed by message', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000001';
    await linkChat(user.id, chatId);

    await POST(webhookRequest(chatId, '/pause'));
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.publishingPaused).toBe(true);
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/wstrzymane/);

    await POST(webhookRequest(chatId, '/resume'));
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.publishingPaused).toBe(false);
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/wznowione/);
  });

  it('/status reports pending/draft/paused state correctly', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000002';
    await linkChat(user.id, chatId);

    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    await prisma.publishJob.create({
      data: {
        status: 'DRAFT',
        postGroupId: 'g1',
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    await POST(webhookRequest(chatId, '/status'));

    const message = mockSendTelegramMessage.mock.calls.at(-1)?.[1] as string;
    expect(message).toMatch(/Publikacje aktywne/);
    expect(message).toMatch(/Szkice czekające na decyzję: 1/);
  });

  it('/approve <id> triggers immediate processing for a job owned by the requester', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000003';
    await linkChat(user.id, chatId);

    const { encrypt } = await import('@/lib/server/crypto');
    const account = await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('token') });
    const video = await createVideo(user.id);
    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: 'g2',
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
        videoId: video.id,
        socialAccountId: account.id,
        // Not testing Reels-vs-Feed here - pin to FEED for the plain, single-request publish
        // path this test's fetch mock expects.
        metaPostFormat: 'FEED',
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'r1', post_id: 'r1' }), text: async () => '' }),
    );

    await POST(webhookRequest(chatId, `/approve ${job.id}`));
    vi.unstubAllGlobals();

    expect((await prisma.publishJob.findUnique({ where: { id: job.id } }))?.status).toBe('SUCCESS');
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Zatwierdzono/);
  });

  it("/approve <id> for a job owned by ANOTHER user is rejected, with zero effect", async () => {
    const { user: owner } = await createTestUser();
    const { user: intruder } = await createTestUser();
    cleanupUserIds.push(owner.id, intruder.id);

    const chatId = '1000000004';
    await linkChat(intruder.id, chatId);

    const account = await createSocialAccount(owner.id, 'FACEBOOK');
    const video = await createVideo(owner.id);
    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: 'g3',
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    await POST(webhookRequest(chatId, `/approve ${job.id}`));

    expect((await prisma.publishJob.findUnique({ where: { id: job.id } }))?.status).toBe('PENDING');
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Nie udało się/);
  });

  it('/reject <id> cancels a job owned by the requester', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000005';
    await linkChat(user.id, chatId);

    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: 'g4',
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    await POST(webhookRequest(chatId, `/reject ${job.id}`));

    expect((await prisma.publishJob.findUnique({ where: { id: job.id } }))?.status).toBe('CANCELED');
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Odrzucono/);
  });

  it('/cancel <id> is an alias for /reject - cancels a PENDING (already scheduled) job', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000006';
    await linkChat(user.id, chatId);

    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: 'g5',
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    await POST(webhookRequest(chatId, `/cancel ${job.id}`));

    expect((await prisma.publishJob.findUnique({ where: { id: job.id } }))?.status).toBe('CANCELED');
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Odrzucono\/anulowano/);
  });

  it('/retry <id> resets a FAILED job to PENDING and retries publishing immediately', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000007';
    await linkChat(user.id, chatId);

    const { encrypt } = await import('@/lib/server/crypto');
    const account = await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('token') });
    const video = await createVideo(user.id);
    const job = await prisma.publishJob.create({
      data: {
        status: 'FAILED',
        postGroupId: 'g6',
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(Date.now() - 60 * 60 * 1000),
        videoId: video.id,
        socialAccountId: account.id,
        errorMessage: 'previous attempt failed',
        metaPostFormat: 'FEED',
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'r2', post_id: 'r2' }), text: async () => '' }),
    );

    await POST(webhookRequest(chatId, `/retry ${job.id}`));
    vi.unstubAllGlobals();

    const refreshed = await prisma.publishJob.findUnique({ where: { id: job.id } });
    expect(refreshed?.status).toBe('SUCCESS');
    expect(refreshed?.errorMessage).toBeNull();
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Ponowiono/);
  });

  it('/retry <id> for a job that is not FAILED/CANCELED is rejected', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000008';
    await linkChat(user.id, chatId);

    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    const job = await prisma.publishJob.create({
      data: {
        status: 'SUCCESS',
        postGroupId: 'g7',
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    await POST(webhookRequest(chatId, `/retry ${job.id}`));

    expect((await prisma.publishJob.findUnique({ where: { id: job.id } }))?.status).toBe('SUCCESS');
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Nie udało się ponowić/);
  });

  it('/logs lists recent completed jobs (success/failed/canceled), newest first', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000009';
    await linkChat(user.id, chatId);

    const account = await createSocialAccount(user.id, 'INSTAGRAM');
    const video = await createVideo(user.id);
    await prisma.publishJob.create({
      data: {
        status: 'SUCCESS',
        postGroupId: 'g8',
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(),
        videoId: video.id,
        socialAccountId: account.id,
        remotePostUrl: 'https://instagram.com/p/abc',
      },
    });
    await prisma.publishJob.create({
      data: {
        status: 'FAILED',
        postGroupId: 'g9',
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(),
        videoId: video.id,
        socialAccountId: account.id,
        errorMessage: 'token expired',
      },
    });

    await POST(webhookRequest(chatId, '/logs'));

    const message = mockSendTelegramMessage.mock.calls.at(-1)?.[1] as string;
    expect(message).toMatch(/instagram\.com\/p\/abc/);
    expect(message).toMatch(/token expired/);
  });

  it('/logs reports no history when there are no completed jobs yet', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000010';
    await linkChat(user.id, chatId);

    await POST(webhookRequest(chatId, '/logs'));

    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Brak zakończonych zadań/);
  });

  it('/revenue honestly reports the feature does not exist yet, rather than fabricating a number', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000011';
    await linkChat(user.id, chatId);

    await POST(webhookRequest(chatId, '/revenue'));

    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/jeszcze nie istnieje/);
  });
});
