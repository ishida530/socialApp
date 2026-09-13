import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// TASK-1.3.4 DoD literally: "jedno zdarzenie da się prześledzić od wejścia do wyjścia w logach
// po jednym identyfikatorze" (one event can be traced from entry to exit in logs by a single
// identifier). Proves this end-to-end through a real webhook call, not just the context-storage
// primitive in isolation (tests/unit/request-context.test.ts).

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/telegram')>();
  return { ...actual, sendTelegramMessage: mockSendTelegramMessage };
});

const { POST } = await import('@/app/api/telegram/webhook/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTelegramLinkCode } = await import('@/lib/server/telegram');
const { encrypt } = await import('@/lib/server/crypto');
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
  await createTelegramLinkCode(userId);
  await prisma.user.update({ where: { id: userId }, data: { telegramChatId: chatId } });
}

function collectLoggedRequestIds(infoSpy: ReturnType<typeof vi.spyOn>): (string | undefined)[] {
  return infoSpy.mock.calls.map((call: unknown[]) => {
    const parsed = JSON.parse(call[0] as string);
    return parsed.requestId as string | undefined;
  });
}

const cleanupUserIds: string[] = [];

afterEach(async () => {
  mockSendTelegramMessage.mockClear();
  vi.unstubAllGlobals();
  await Promise.all(cleanupUserIds.splice(0).map((id) => deleteTestUser(id)));
});

describe('Telegram webhook -> publish chain shares one requestId (TASK-1.3.4)', () => {
  it('every log line emitted while handling one /approve call carries the same requestId', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '3000000001';
    await linkChat(user.id, chatId);

    const account = await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('token') });
    const video = await createVideo(user.id);
    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: 'trace-group',
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
        videoId: video.id,
        socialAccountId: account.id,
        metaPostFormat: 'FEED',
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'r1', post_id: 'r1' }), text: async () => '' }),
    );

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await POST(webhookRequest(chatId, `/approve ${job.id}`));

    const requestIds = collectLoggedRequestIds(infoSpy);
    infoSpy.mockRestore();

    // processClaimedJob logs at least "job-processing-started" and "job-succeeded" during this
    // chain - if there were only 0-1 log lines the test below would be vacuously true, so assert
    // there's real chain depth to trace across first.
    expect(requestIds.length).toBeGreaterThan(1);
    expect(requestIds.every((id) => id !== undefined)).toBe(true);
    expect(new Set(requestIds).size).toBe(1);
  });

  it('two separate webhook calls get two different requestIds - not a stale/shared value', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '3000000002';
    await linkChat(user.id, chatId);

    const account = await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('token') });

    async function makeJob(postGroupId: string) {
      const video = await createVideo(user.id);
      return prisma.publishJob.create({
        data: {
          status: 'PENDING',
          postGroupId,
          caption: 'x',
          hashtags: [],
          scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
          videoId: video.id,
          socialAccountId: account.id,
          metaPostFormat: 'FEED',
        },
      });
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'r1', post_id: 'r1' }), text: async () => '' }),
    );

    const jobA = await makeJob('trace-group-a');
    const jobB = await makeJob('trace-group-b');

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await POST(webhookRequest(chatId, `/approve ${jobA.id}`));
    const firstCallIds = collectLoggedRequestIds(infoSpy);

    infoSpy.mockClear();
    await POST(webhookRequest(chatId, `/approve ${jobB.id}`));
    const secondCallIds = collectLoggedRequestIds(infoSpy);

    infoSpy.mockRestore();

    expect(firstCallIds[0]).toBeDefined();
    expect(secondCallIds[0]).toBeDefined();
    expect(firstCallIds[0]).not.toBe(secondCallIds[0]);
  });
});
