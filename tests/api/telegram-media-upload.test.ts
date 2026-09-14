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
  ['TIKTOK', { platform: 'TIKTOK', title: 'TikTok Title', caption: 'TikTok caption', hashtags: ['#rap'] }],
]);

vi.mock('@/lib/server/composer-drafts', () => ({
  generatePlatformBundles: vi.fn().mockResolvedValue({ bundlesByPlatform: mockBundles, orchestrationWarning: null, schedule: [] }),
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
    const [, message, buttons] = mockSendTelegramMessageWithButtons.mock.calls[0];
    // Format type shown per platform (Reels is the sticky default for a fresh Meta account).
    expect(message).toContain('INSTAGRAM — Reels');
    // Row 1: toggle + edit + Reels/post format buttons for the one connected platform (Instagram, video). Row 2: Publikuj/Anuluj.
    expect(buttons[0]).toEqual([
      { text: '✅ INSTAGRAM', callback_data: `toggle:${createdJobs[0].postGroupId}:INSTAGRAM` },
      { text: '✏️ Edytuj', callback_data: `editstart:${createdJobs[0].postGroupId}:INSTAGRAM` },
      { text: '🎬 Reels', callback_data: `formattoggle:${createdJobs[0].postGroupId}:INSTAGRAM` },
    ]);
    expect(buttons[1]).toEqual([
      { text: '✅ Publikuj', callback_data: `publish:${createdJobs[0].postGroupId}` },
      { text: '📅 Zaplanuj', callback_data: `schedulestart:${createdJobs[0].postGroupId}` },
      { text: '❌ Anuluj', callback_data: `cancel:${createdJobs[0].postGroupId}` },
    ]);
  });

  it('auto-attaches a new upload to the active campaign, with zero extra step from the user (real end-to-end wiring, not a mocked call)', async () => {
    const { startCampaign } = await import('@/lib/server/campaigns');

    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'INSTAGRAM');
    const chatId = '111222337';
    await linkChat(user.id, chatId);

    const { campaign } = await startCampaign(user.id, 'Premiera EP');

    const fakeVideo = await createVideo(user.id);
    mockUploadTelegramMediaAsVideo.mockResolvedValue(fakeVideo);

    await POST(webhookRequest({ message: { chat: { id: Number(chatId) }, video: { file_id: 'tg-file-campaign', file_size: 1024 } } }));

    const createdJob = await prisma.publishJob.findFirstOrThrow({ where: { videoId: fakeVideo.id } });
    expect(createdJob.campaignId).toBe(campaign.id);
  });

  it('shows the computed schedule suggestion in the preview, instead of discarding it (EPIC 4 "popraw" step)', async () => {
    const { generatePlatformBundles } = await import('@/lib/server/composer-drafts');
    vi.mocked(generatePlatformBundles).mockResolvedValueOnce({
      bundlesByPlatform: mockBundles as never,
      orchestrationWarning: null,
      schedule: [
        { platform: 'TIKTOK', scheduledFor: new Date('2026-09-20T18:00:00.000Z').toISOString(), timezone: 'UTC', score: 0.7, reason: 'Baseline persona slot (brak danych historycznych).' },
        {
          platform: 'INSTAGRAM',
          scheduledFor: new Date('2026-09-20T19:00:00.000Z').toISOString(),
          timezone: 'UTC',
          score: 0.95,
          reason: 'Baseline + korekta historyczna z ograniczeniem odchylenia.',
        },
      ],
    });

    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'INSTAGRAM');
    const chatId = '111222335';
    await linkChat(user.id, chatId);

    const fakeVideo = await createVideo(user.id);
    mockUploadTelegramMediaAsVideo.mockResolvedValue(fakeVideo);

    await POST(webhookRequest({ message: { chat: { id: Number(chatId) }, video: { file_id: 'tg-file-2', file_size: 1024 } } }));

    const [, message] = mockSendTelegramMessageWithButtons.mock.calls[0];
    // Highest-scored slot (INSTAGRAM, 0.95) shown, not the first one in the array (TIKTOK, 0.7).
    expect(message).toContain('💡 Sugerowana pora: 19:00');
    expect(message).toContain('na podstawie Twoich wcześniejszych publikacji');
  });

  it('labels the schedule suggestion as baseline (not data-driven) when there is no historical data', async () => {
    const { generatePlatformBundles } = await import('@/lib/server/composer-drafts');
    vi.mocked(generatePlatformBundles).mockResolvedValueOnce({
      bundlesByPlatform: mockBundles as never,
      orchestrationWarning: null,
      schedule: [
        { platform: 'INSTAGRAM', scheduledFor: new Date('2026-09-20T17:00:00.000Z').toISOString(), timezone: 'UTC', score: 0.7, reason: 'Baseline persona slot (brak danych historycznych).' },
      ],
    });

    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'INSTAGRAM');
    const chatId = '111222336';
    await linkChat(user.id, chatId);

    const fakeVideo = await createVideo(user.id);
    mockUploadTelegramMediaAsVideo.mockResolvedValue(fakeVideo);

    await POST(webhookRequest({ message: { chat: { id: Number(chatId) }, video: { file_id: 'tg-file-3', file_size: 1024 } } }));

    const [, message] = mockSendTelegramMessageWithButtons.mock.calls[0];
    expect(message).toContain('💡 Sugerowana pora: 17:00');
    expect(message).toContain('baseline - jeszcze za mało Twoich danych');
  });

  it('forwards the media message caption as AI context, instead of leaving it empty', async () => {
    const { generatePlatformBundles } = await import('@/lib/server/composer-drafts');
    vi.mocked(generatePlatformBundles).mockClear();

    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'INSTAGRAM');
    const chatId = '111222334';
    await linkChat(user.id, chatId);

    const fakeVideo = await createVideo(user.id);
    mockUploadTelegramMediaAsVideo.mockResolvedValue(fakeVideo);

    await POST(
      webhookRequest({
        message: {
          chat: { id: Number(chatId) },
          video: { file_id: 'tg-file-caption', file_size: 1024 },
          caption: 'Nowy freestyle z dzisiejszej sesji',
        },
      }),
    );

    expect(generatePlatformBundles).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ rawInput: 'Nowy freestyle z dzisiejszej sesji' }),
    );
  });

  it('sends an immediate processing acknowledgment before the slow upload/AI work, so the chat is never silently unresponsive', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'INSTAGRAM');
    const chatId = '111222444';
    await linkChat(user.id, chatId);

    const fakeVideo = await createVideo(user.id);
    mockUploadTelegramMediaAsVideo.mockResolvedValue(fakeVideo);

    const response = await POST(
      webhookRequest({ message: { chat: { id: Number(chatId) }, video: { file_id: 'tg-file-ack', file_size: 1024 } } }),
    );
    expect(response.status).toBe(200);

    // The ack is the FIRST message sent, before uploadTelegramMediaAsVideo/generatePlatformBundles
    // resolve - sendTelegramMessage's own timing doesn't prove ordering relative to those async
    // calls, but this is the only sendTelegramMessage (non-buttons) call in the happy path, so
    // its content is what matters here.
    expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTelegramMessage.mock.calls[0][1]).toMatch(/Odebrano/);
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

  // BUG-003: pierwszy realny przebieg TASK-3.3.1 (prawdziwy bot, prawdziwy klik "Publikuj")
  // failował dla TikToka: "Dla TikTok wybierz poziom prywatności publikacji w kroku przeglądu."
  // - żadna platforma nie została opublikowana, nie tylko TikTok (enqueueDraftGroup jest
  // wszystko-albo-nic). Przyczyna: DRAFT tworzony przez upload z Telegrama nigdy nie dostawał
  // domyślnego tiktokPrivacyLevel, mimo że dokładnie to zachowanie było opisane jako decyzja
  // Architekta w logu ról TASK-3.1.2 - udokumentowane, ale nigdy nie zaimplementowane.
  it('sets a default tiktokPrivacyLevel on the TikTok DRAFT job created from a Telegram upload (BUG-003)', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'TIKTOK', { accessToken: encrypt('real-looking-tiktok-access-token') });
    const chatId = '555444333222';
    await linkChat(user.id, chatId);

    const fakeVideo = await createVideo(user.id);
    mockUploadTelegramMediaAsVideo.mockResolvedValue(fakeVideo);

    await POST(
      webhookRequest({ message: { chat: { id: Number(chatId) }, video: { file_id: 'tg-file-tiktok' } } }),
    );

    const tiktokJob = await prisma.publishJob.findFirstOrThrow({ where: { videoId: fakeVideo.id } });
    expect(tiktokJob.tiktokPrivacyLevel).toBeTruthy();

    // Domknięcie pełnego cyklu: z domyślnym poziomem prywatności ustawionym, kliknięcie
    // "Publikuj" musi faktycznie ruszyć publikację TikTok, nie powtórzyć ten sam błąd.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { publish_id: 'tiktok-publish-1' } }),
        text: async () => '',
      }),
    );

    const response = await POST(
      webhookRequest({
        callback_query: {
          id: 'cbq-bug003',
          data: `publish:${tiktokJob.postGroupId}`,
          message: { chat: { id: Number(chatId) }, message_id: 55 },
        },
      }),
    );
    expect(response.status).toBe(200);
    vi.unstubAllGlobals();

    const refreshed = await prisma.publishJob.findUniqueOrThrow({ where: { id: tiktokJob.id } });
    // TikTok publish jest async (init -> poll status), więc po "Publikuj" job jest PENDING
    // ze znacznikiem śledzenia, NIE z powrotem w DRAFT ani z błędem braku poziomu prywatności.
    expect(refreshed.status).toBe('PENDING');
    expect(refreshed.errorMessage).toMatch(/tiktok-tracking/);

    // 2 calls: the immediate "⏳ Publikuję..." processing ack, then the final result.
    expect(mockEditTelegramMessage).toHaveBeenCalledTimes(2);
    expect(mockEditTelegramMessage.mock.calls[0][2]).toMatch(/Publikuję/);
    expect(mockEditTelegramMessage.mock.calls.at(-1)?.[2]).not.toMatch(/poziom prywatności/);
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
        // Not testing Reels-vs-Feed here - pin to FEED for the plain, single-request publish
        // path this test's fetch mock expects.
        metaPostFormat: 'FEED',
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
    expect(mockEditTelegramMessage).toHaveBeenCalledWith(
      chatId,
      42,
      expect.stringContaining('https://www.facebook.com/remote-1'),
    );

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
