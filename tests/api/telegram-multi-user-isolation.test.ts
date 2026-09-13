import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// TASK-3.3.2: dwa konta Telegram nigdy nie widzą ani nie wpływają na dane drugiego. DoD: próba
// dostępu do cudzego zadania/konta zwraca odmowę, nie dane. Komendy per-user (np. /status,
// /logs) są ze swojej natury odizolowane, bo zawsze filtrują po `linkedUser.id` wyprowadzonym z
// WŁASNEGO powiązanego telegramChatId nadawcy - nie ma parametru "czyje konto pokazać". Test
// dowodzi tego bezpośrednio, zamiast zakładać na podstawie przeczytania kodu.

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);
const mockAnswerTelegramCallbackQuery = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/telegram')>();
  return {
    ...actual,
    sendTelegramMessage: mockSendTelegramMessage,
    answerTelegramCallbackQuery: mockAnswerTelegramCallbackQuery,
    editTelegramMessage: vi.fn().mockResolvedValue(undefined),
  };
});

const { POST } = await import('@/app/api/telegram/webhook/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTelegramLinkCode } = await import('@/lib/server/telegram');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo } = await import('../helpers/fixtures');

const WEBHOOK_URL = 'http://localhost:3000/api/telegram/webhook';
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET as string;

function textRequest(chatId: string, text: string) {
  return new NextRequest(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
    body: JSON.stringify({ message: { chat: { id: Number(chatId) }, text } }),
  });
}

function callbackRequest(chatId: string, data: string) {
  return new NextRequest(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
    body: JSON.stringify({
      callback_query: { id: 'cbq-1', data, message: { chat: { id: Number(chatId) }, message_id: 5 } },
    }),
  });
}

async function linkChat(userId: string, chatId: string) {
  await createTelegramLinkCode(userId);
  await prisma.user.update({ where: { id: userId }, data: { telegramChatId: chatId } });
}

async function makeJob(userId: string, postGroupId: string, status: 'DRAFT' | 'PENDING' | 'FAILED', platform: 'FACEBOOK' | 'INSTAGRAM' = 'FACEBOOK') {
  const account = await createSocialAccount(userId, platform);
  const video = await createVideo(userId);
  return prisma.publishJob.create({
    data: {
      status,
      postGroupId,
      caption: 'x',
      hashtags: [],
      scheduledFor: status === 'DRAFT' ? new Date() : new Date(Date.now() + 60 * 60 * 1000),
      videoId: video.id,
      socialAccountId: account.id,
    },
  });
}

const cleanupUserIds: string[] = [];

afterEach(async () => {
  mockSendTelegramMessage.mockClear();
  mockAnswerTelegramCallbackQuery.mockClear();
  await Promise.all(cleanupUserIds.splice(0).map((id) => deleteTestUser(id)));
});

describe('Telegram multi-user isolation (TASK-3.3.2)', () => {
  it('/status for user A never reflects user B counts, and vice versa', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    cleanupUserIds.push(userA.id, userB.id);

    const chatA = '2000000001';
    const chatB = '2000000002';
    await linkChat(userA.id, chatA);
    await linkChat(userB.id, chatB);

    // A has 2 drafts, B has 5 - if isolation ever broke, A's count would leak B's jobs.
    await makeJob(userA.id, 'a-group-1', 'DRAFT');
    await makeJob(userA.id, 'a-group-2', 'DRAFT');
    for (let i = 0; i < 5; i += 1) {
      await makeJob(userB.id, `b-group-${i}`, 'DRAFT');
    }

    await POST(textRequest(chatA, '/status'));
    const messageForA = mockSendTelegramMessage.mock.calls.at(-1)?.[1] as string;
    expect(messageForA).toMatch(/Szkice czekające na decyzję: 2/);

    await POST(textRequest(chatB, '/status'));
    const messageForB = mockSendTelegramMessage.mock.calls.at(-1)?.[1] as string;
    expect(messageForB).toMatch(/Szkice czekające na decyzję: 5/);
  });

  it('/logs for user A never lists user B jobs', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    cleanupUserIds.push(userA.id, userB.id);

    const chatA = '2000000003';
    const chatB = '2000000004';
    await linkChat(userA.id, chatA);
    await linkChat(userB.id, chatB);

    const accountB = await createSocialAccount(userB.id, 'INSTAGRAM');
    const videoB = await createVideo(userB.id);
    await prisma.publishJob.create({
      data: {
        status: 'FAILED',
        postGroupId: 'b-secret-group',
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(),
        videoId: videoB.id,
        socialAccountId: accountB.id,
        errorMessage: 'user-B-only-error-marker',
      },
    });

    await POST(textRequest(chatA, '/logs'));

    const messageForA = mockSendTelegramMessage.mock.calls.at(-1)?.[1] as string;
    expect(messageForA).not.toContain('user-B-only-error-marker');
    expect(messageForA).toMatch(/Brak zakończonych zadań/);
  });

  it('user B cannot /reject, /retry, or /cancel a job that belongs to user A - zero effect, explicit denial', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    cleanupUserIds.push(userA.id, userB.id);

    const chatB = '2000000005';
    await linkChat(userB.id, chatB);

    const pendingJob = await makeJob(userA.id, 'a-pending-group', 'PENDING');
    const failedJob = await makeJob(userA.id, 'a-failed-group', 'FAILED');

    await POST(textRequest(chatB, `/reject ${pendingJob.id}`));
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Nie udało się/);
    expect((await prisma.publishJob.findUnique({ where: { id: pendingJob.id } }))?.status).toBe('PENDING');

    await POST(textRequest(chatB, `/cancel ${pendingJob.id}`));
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Nie udało się/);
    expect((await prisma.publishJob.findUnique({ where: { id: pendingJob.id } }))?.status).toBe('PENDING');

    await POST(textRequest(chatB, `/retry ${failedJob.id}`));
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Nie udało się/);
    expect((await prisma.publishJob.findUnique({ where: { id: failedJob.id } }))?.status).toBe('FAILED');
  });

  it('a callback query (inline button tap) referencing another user\'s postGroupId is denied, not actioned', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    cleanupUserIds.push(userA.id, userB.id);

    const chatB = '2000000006';
    await linkChat(userB.id, chatB);

    const draftJob = await makeJob(userA.id, 'a-draft-group', 'DRAFT');

    await POST(callbackRequest(chatB, `cancel:${draftJob.postGroupId}`));

    expect(mockAnswerTelegramCallbackQuery).toHaveBeenCalledWith(
      'cbq-1',
      expect.stringMatching(/Nie znaleziono/),
    );
    expect((await prisma.publishJob.findUnique({ where: { id: draftJob.id } }))?.status).toBe('DRAFT');
  });
});
