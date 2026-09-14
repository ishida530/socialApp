import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);
const mockSendTelegramMessageWithButtons = vi.fn().mockResolvedValue({ messageId: 1 });

vi.mock('@/lib/server/telegram', () => ({
  sendTelegramMessage: mockSendTelegramMessage,
  sendTelegramMessageWithButtons: mockSendTelegramMessageWithButtons,
}));

const { sendContentSuggestions } = await import('@/lib/server/telegram-notifications');
const { prisma } = await import('@/lib/server/prisma');
const { encrypt } = await import('@/lib/server/crypto');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo } = await import('../helpers/fixtures');

// Proactive content suggestions (2026-09-14): agent-initiated, real-data-driven post suggestions,
// requested explicitly by the product owner. Two paths (Facebook text post vs media idea), never
// publishing without the owner's own approval tap.

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
const cleanupUserIds: string[] = [];

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterEach(async () => {
  vi.unstubAllGlobals();
  mockSendTelegramMessage.mockClear();
  mockSendTelegramMessageWithButtons.mockClear();
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  }
  await Promise.all(cleanupUserIds.splice(0).map((id) => deleteTestUser(id)));
});

function claudeToolResponse(name: string, input: unknown) {
  return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name, input }] }) };
}

describe('sendContentSuggestions - Facebook text post path', () => {
  it('creates a DRAFT text post and sends it with approval buttons, then sets the cooldown', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });
    await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('token') });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        claudeToolResponse('suggest_facebook_text_post', {
          canSuggest: true,
          postText: 'Dobry tydzień za nami! Co Wy sądzicie - lepiej rano czy wieczorem?',
        }),
      ),
    );

    const result = await sendContentSuggestions();
    expect(result.usersNotified).toBe(1);

    expect(mockSendTelegramMessageWithButtons).toHaveBeenCalledTimes(1);
    const [, message, buttons] = mockSendTelegramMessageWithButtons.mock.calls[0];
    expect(message).toContain('Dobry tydzień za nami!');
    const flatButtons = buttons.flat();
    expect(flatButtons.some((b: { callback_data: string }) => b.callback_data.startsWith('publish:'))).toBe(true);
    expect(flatButtons.some((b: { callback_data: string }) => b.callback_data.startsWith('cancel:'))).toBe(true);
    expect(flatButtons.some((b: { callback_data: string }) => b.callback_data.startsWith('editstart:'))).toBe(true);

    const job = await prisma.publishJob.findFirstOrThrow({ where: { video: { userId: user.id } }, include: { video: true } });
    expect(job.status).toBe('DRAFT');
    expect(job.caption).toBe('Dobry tydzień za nami! Co Wy sądzicie - lepiej rano czy wieczorem?');
    expect(job.video.mediaType).toBe('TEXT');

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.lastContentSuggestionSentAt).not.toBeNull();
  });

  it('does not create a draft when Claude declines (nothing genuine to say)', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });
    await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('token') });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(claudeToolResponse('suggest_facebook_text_post', { canSuggest: false })));

    const result = await sendContentSuggestions();
    expect(result.usersNotified).toBe(0);
    expect(mockSendTelegramMessageWithButtons).not.toHaveBeenCalled();
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.lastContentSuggestionSentAt).toBeNull();
  });
});

describe('sendContentSuggestions - media content idea fallback', () => {
  async function makeSuccessJob(userId: string) {
    const account = await createSocialAccount(userId, 'TIKTOK');
    const video = await createVideo(userId);
    return prisma.publishJob.create({
      data: {
        status: 'SUCCESS',
        postGroupId: `group-${video.id}`,
        caption: 'Poprzedni post o czymś ciekawym',
        hashtags: ['#tag'],
        scheduledFor: new Date(),
        publishedAt: new Date(),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });
  }

  it('falls back to a content idea nudge when there is no usable Facebook account', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });
    await makeSuccessJob(user.id);
    await makeSuccessJob(user.id);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        claudeToolResponse('suggest_content_ideas', {
          ideas: [{ title: 'Pokaż proces powstawania', description: 'Nagraj kulisy pracy nad kolejnym utworem.' }],
        }),
      ),
    );

    const result = await sendContentSuggestions();
    expect(result.usersNotified).toBe(1);

    expect(mockSendTelegramMessageWithButtons).not.toHaveBeenCalled();
    expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTelegramMessage.mock.calls[0][1]).toContain('Pokaż proces powstawania');

    // No new PublishJob created for the idea path - it's just a nudge, not a draft to approve.
    const jobCount = await prisma.publishJob.count({ where: { video: { userId: user.id } } });
    expect(jobCount).toBe(2);
  });

  it('skips a user with no Facebook and fewer than 2 published posts (nothing to base an idea on)', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });
    await makeSuccessJob(user.id);

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendContentSuggestions();
    expect(result.usersNotified).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sendContentSuggestions - eligibility gates', () => {
  it('respects the 7-day cooldown', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: `chat-${user.id}`, lastContentSuggestionSentAt: new Date() },
    });
    await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('token') });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendContentSuggestions();
    expect(result.usersNotified).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips a user whose publishing is currently paused, instead of offering a new post to approve', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}`, publishingPaused: true } });
    await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('token') });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendContentSuggestions();
    expect(result.usersNotified).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips a user with no linked Telegram chat', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await createSocialAccount(user.id, 'FACEBOOK', { accessToken: encrypt('token') });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendContentSuggestions();
    expect(result.usersNotified).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
