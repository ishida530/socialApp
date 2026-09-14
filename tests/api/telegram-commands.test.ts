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

  it('/revenue reports real, honestly-zero aggregates for a fresh account (EPIC 5)', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000011';
    await linkChat(user.id, chatId);

    await POST(webhookRequest(chatId, '/revenue'));

    const message = mockSendTelegramMessage.mock.calls.at(-1)?.[1] as string;
    expect(message).toMatch(/Fani: 0/);
    expect(message).toMatch(/Sprzedaże łącznie: 0/);
  });

  it('/fan adds a fan by email, rejecting an invalid email instead of saving garbage', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000012';
    await linkChat(user.id, chatId);

    const badResponse = await POST(webhookRequest(chatId, '/fan not-an-email'));
    expect(badResponse.status).toBe(200);
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Nieprawidłowy adres email/);

    const goodResponse = await POST(webhookRequest(chatId, '/fan jan@example.com Jan Kowalski'));
    expect(goodResponse.status).toBe(200);
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Dodano fana: jan@example\.com \(Jan Kowalski\)/);

    const fan = await prisma.fan.findFirst({ where: { userId: user.id, email: 'jan@example.com' } });
    expect(fan?.name).toBe('Jan Kowalski');
  });

  it('/fans reports the real count and recent fans, not a placeholder', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000013';
    await linkChat(user.id, chatId);

    await POST(webhookRequest(chatId, '/fan ala@example.com Ala'));
    await POST(webhookRequest(chatId, '/fans'));

    const message = mockSendTelegramMessage.mock.calls.at(-1)?.[1] as string;
    expect(message).toMatch(/Fani: 1/);
    expect(message).toContain('ala@example.com (Ala)');
  });

  it('/sale records a manual sale, rejecting an invalid amount instead of saving garbage', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000014';
    await linkChat(user.id, chatId);

    const badResponse = await POST(webhookRequest(chatId, '/sale abc Koszulka'));
    expect(badResponse.status).toBe(200);
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Nieprawidłowa kwota/);

    const goodResponse = await POST(webhookRequest(chatId, '/sale 80,50 Koszulka czarna M'));
    expect(goodResponse.status).toBe(200);
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Zapisano sprzedaż: Koszulka czarna M — 80\.50 PLN/);

    const sale = await prisma.sale.findFirst({ where: { userId: user.id } });
    expect(sale?.amountCents).toBe(8050);

    await POST(webhookRequest(chatId, '/revenue'));
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Sprzedaże łącznie: 1 \(80\.50 PLN\)/);
  });

  it('/goal sets a goal, /goals lists it, /goal-done completes it', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000015';
    await linkChat(user.id, chatId);

    await POST(webhookRequest(chatId, '/goal Publikować 3x w tygodniu'));
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Zapisano cel: Publikować 3x w tygodniu/);

    const goal = await prisma.goal.findFirstOrThrow({ where: { userId: user.id } });

    await POST(webhookRequest(chatId, '/goals'));
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toContain('Publikować 3x w tygodniu');

    await POST(webhookRequest(chatId, `/goal-done ${goal.id}`));
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Cel zrealizowany/);

    await POST(webhookRequest(chatId, '/goals'));
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Brak aktywnych celów/);
  });

  it('/goal-done rejects an unknown goal ID instead of silently succeeding', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000016';
    await linkChat(user.id, chatId);

    await POST(webhookRequest(chatId, '/goal-done not-a-real-id'));
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Nie udało się/);
  });

  it('/campaign starts a campaign, a second /campaign auto-ends the first, /campaigns lists both', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000017';
    await linkChat(user.id, chatId);

    await POST(webhookRequest(chatId, '/campaign Premiera singla'));
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Kampania "Premiera singla" aktywna/);

    await POST(webhookRequest(chatId, '/campaign Merch drop'));
    const message = mockSendTelegramMessage.mock.calls.at(-1)?.[1] as string;
    expect(message).toMatch(/Kampania "Merch drop" aktywna/);
    expect(message).toContain('Zakończono poprzednią aktywną kampanię: "Premiera singla"');

    await POST(webhookRequest(chatId, '/campaigns'));
    const listMessage = mockSendTelegramMessage.mock.calls.at(-1)?.[1] as string;
    expect(listMessage).toContain('Merch drop (aktywna)');
    expect(listMessage).toContain('Premiera singla (zakończona)');
  });

  it('/campaign-report (no name) shows the active campaign\'s real aggregated results', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000018';
    await linkChat(user.id, chatId);
    await createSocialAccount(user.id, 'INSTAGRAM');

    await POST(webhookRequest(chatId, '/campaign Premiera EP'));

    const fakeVideo = await createVideo(user.id);
    const job = await prisma.publishJob.create({
      data: {
        status: 'SUCCESS',
        postGroupId: `group-${fakeVideo.id}`,
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(),
        publishedAt: new Date(),
        remotePostId: `remote-${fakeVideo.id}`,
        videoId: fakeVideo.id,
        socialAccountId: (await prisma.socialAccount.findFirstOrThrow({ where: { userId: user.id } })).id,
      },
    });

    const { attachActiveCampaignToJobs } = await import('@/lib/server/campaigns');
    await attachActiveCampaignToJobs(user.id, [job.id]);
    await prisma.postMetric.create({ data: { publishJobId: job.id, views: 200, likes: 20, comments: 5, shares: 2 } });

    await POST(webhookRequest(chatId, '/campaign-report'));
    const message = mockSendTelegramMessage.mock.calls.at(-1)?.[1] as string;
    expect(message).toContain('Premiera EP');
    expect(message).toContain('Publikacje: 1');
    expect(message).toContain('Wyświetlenia: 200');
  });

  it('/campaign-report with no active campaign and no name given asks for a name instead of guessing', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000019';
    await linkChat(user.id, chatId);

    await POST(webhookRequest(chatId, '/campaign-report'));
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Podaj nazwę kampanii/);
  });

  it('/campaign-end ends the active campaign, with an honest message when there is none', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000020';
    await linkChat(user.id, chatId);

    await POST(webhookRequest(chatId, '/campaign-end'));
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toBe('Nie masz aktywnej kampanii.');

    await POST(webhookRequest(chatId, '/campaign Test'));
    await POST(webhookRequest(chatId, '/campaign-end'));
    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toMatch(/Zakończono kampanię "Test"/);
  });

  it('/followers reports real, honestly-missing trend data for a fresh account', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000021';
    await linkChat(user.id, chatId);
    const account = await createSocialAccount(user.id, 'TIKTOK');
    await prisma.accountGrowthSnapshot.create({ data: { socialAccountId: account.id, followerCount: 1250 } });

    await POST(webhookRequest(chatId, '/followers'));

    const message = mockSendTelegramMessage.mock.calls.at(-1)?.[1] as string;
    expect(message).toContain('TIKTOK: 1250 (brak jeszcze wystarczających danych)');
  });

  it('/followers reports a real week-over-week delta once there is history', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    const chatId = '1000000022';
    await linkChat(user.id, chatId);
    const account = await createSocialAccount(user.id, 'TIKTOK');
    await prisma.accountGrowthSnapshot.create({
      data: { socialAccountId: account.id, followerCount: 1000, fetchedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });
    await prisma.accountGrowthSnapshot.create({ data: { socialAccountId: account.id, followerCount: 1045 } });

    await POST(webhookRequest(chatId, '/followers'));

    expect(mockSendTelegramMessage.mock.calls.at(-1)?.[1]).toContain('TIKTOK: 1045 (+45 w tym tygodniu)');
  });
});
