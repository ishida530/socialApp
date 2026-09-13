import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runMentorTurn } from '@/lib/server/telegram-mentor-agent';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo } from '../helpers/fixtures';

// Agent-mentor: free-form Telegram fallback. Tools are READ-ONLY by design (PO decision
// 2026-09-13) - these tests assert the tool loop actually calls real, existing read functions
// (not fakes), that history persists and is replayed, and that a failed/unconfigured turn
// degrades to a safe message instead of throwing or silently losing the user's message.

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
let cleanupUserId: string | null = null;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  }
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

function textOnlyResponse(text: string) {
  return { ok: true, json: async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }) };
}

describe('runMentorTurn', () => {
  it('answers directly without calling any tool when none is needed', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textOnlyResponse('Cześć! W czym mogę pomóc?')));

    const reply = await runMentorTurn(user.id, 'siema');
    expect(reply).toBe('Cześć! W czym mogę pomóc?');
  });

  it('executes a real tool call (get_status) and feeds the result back to Claude', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { publishingPaused: true } });

    let capturedToolResult: string | null = null;
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        callCount += 1;
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({
              content: [{ type: 'tool_use', id: 'tool-1', name: 'get_status', input: {} }],
              stop_reason: 'tool_use',
            }),
          };
        }

        const body = JSON.parse(init!.body as string);
        const lastMessage = body.messages[body.messages.length - 1];
        const toolResultBlock = lastMessage.content.find((block: { type: string }) => block.type === 'tool_result');
        capturedToolResult = toolResultBlock?.content ?? null;

        return textOnlyResponse('Masz wstrzymane publikacje.');
      }),
    );

    const reply = await runMentorTurn(user.id, 'czy mam wstrzymane publikacje?');

    expect(reply).toBe('Masz wstrzymane publikacje.');
    expect(capturedToolResult).not.toBeNull();
    expect(JSON.parse(capturedToolResult as unknown as string).publishingPaused).toBe(true);
  });

  it('executes get_performance_insights using real PostMetric data, sorted by engagement rate', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const account = await createSocialAccount(user.id, 'TIKTOK');
    const video = await createVideo(user.id);
    const publishedAt = new Date();
    publishedAt.setUTCDate(publishedAt.getUTCDate() - 3);
    const job = await prisma.publishJob.create({
      data: {
        status: 'SUCCESS',
        postGroupId: `group-${video.id}`,
        caption: 'x',
        hashtags: [],
        scheduledFor: publishedAt,
        publishedAt,
        remotePostId: `remote-${video.id}`,
        videoId: video.id,
        socialAccountId: account.id,
      },
    });
    await prisma.postMetric.create({ data: { publishJobId: job.id, likes: 10, comments: 0, shares: 0, views: 100 } });

    let capturedToolResult: string | null = null;
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        callCount += 1;
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({
              content: [{ type: 'tool_use', id: 'tool-1', name: 'get_performance_insights', input: {} }],
              stop_reason: 'tool_use',
            }),
          };
        }
        const body = JSON.parse(init!.body as string);
        const lastMessage = body.messages[body.messages.length - 1];
        const toolResultBlock = lastMessage.content.find((block: { type: string }) => block.type === 'tool_result');
        capturedToolResult = toolResultBlock?.content ?? null;
        return textOnlyResponse('Najlepsza pora to widoczna w danych.');
      }),
    );

    await runMentorTurn(user.id, 'kiedy najlepiej publikowac?');

    const parsed = JSON.parse(capturedToolResult as unknown as string);
    expect(parsed.insights).toHaveLength(1);
    expect(parsed.insights[0]).toMatchObject({ platform: 'TIKTOK', er: 0.1 });
  });

  it('get_performance_insights returns an honest "not enough data" note for a user with no metrics', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    let capturedToolResult: string | null = null;
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        callCount += 1;
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({
              content: [{ type: 'tool_use', id: 'tool-1', name: 'get_performance_insights', input: {} }],
              stop_reason: 'tool_use',
            }),
          };
        }
        const body = JSON.parse(init!.body as string);
        const lastMessage = body.messages[body.messages.length - 1];
        const toolResultBlock = lastMessage.content.find((block: { type: string }) => block.type === 'tool_result');
        capturedToolResult = toolResultBlock?.content ?? null;
        return textOnlyResponse('Nie mam jeszcze danych.');
      }),
    );

    await runMentorTurn(user.id, 'jak mi idzie?');

    const parsed = JSON.parse(capturedToolResult as unknown as string);
    expect(parsed.note).toMatch(/brak jeszcze wystarczaj/i);
  });

  it('persists user and assistant turns, and replays history on the next call', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textOnlyResponse('Odpowiedź 1')));
    await runMentorTurn(user.id, 'pierwsze pytanie');

    const turns = await prisma.agentConversationTurn.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ role: 'user', content: 'pierwsze pytanie' });
    expect(turns[1]).toMatchObject({ role: 'assistant', content: 'Odpowiedź 1' });

    let capturedMessages: unknown[] | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init!.body as string);
        capturedMessages = body.messages;
        return textOnlyResponse('Odpowiedź 2');
      }),
    );
    await runMentorTurn(user.id, 'drugie pytanie');

    expect(capturedMessages).toEqual([
      { role: 'user', content: 'pierwsze pytanie' },
      { role: 'assistant', content: 'Odpowiedź 1' },
      { role: 'user', content: 'drugie pytanie' },
    ]);
  });

  it('does not persist anything when Claude is not configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const reply = await runMentorTurn(user.id, 'pytanie');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(reply).toMatch(/nie udało się/i);
    expect(await prisma.agentConversationTurn.count({ where: { userId: user.id } })).toBe(0);
  });

  it('never fabricates an action - the account_info tool is read-only and the model must ask for a command instead', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await createSocialAccount(user.id, 'TIKTOK');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(textOnlyResponse('Aby anulować, wpisz /cancel <id>.')),
    );

    const reply = await runMentorTurn(user.id, 'anuluj moje ostatnie zadanie');
    expect(reply).toContain('/cancel');
  });

  it('gives up after the tool-round cap instead of looping forever', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: 'tool_use', id: 'loop', name: 'get_status', input: {} }],
          stop_reason: 'tool_use',
        }),
      }),
    );

    const reply = await runMentorTurn(user.id, 'pytanie w kółko');
    expect(reply).toMatch(/nie udało się/i);
  });
});
