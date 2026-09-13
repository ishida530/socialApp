import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateContentIdeas } from '@/lib/server/telegram-content-ideas';

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

const recentPosts = [
  { caption: 'Nowy freestyle o mieście nocą', hashtags: ['rap', 'freestyle'], title: null },
  { caption: 'Sesja na dachu, klimat wieczoru', hashtags: ['rap'], title: null },
];

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  }
});

function mockClaudeIdeas(ideas: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content: [{ type: 'tool_use', name: 'suggest_content_ideas', input: { ideas } }] }),
  });
}

describe('generateContentIdeas', () => {
  it('returns 2-3 ideas parsed from the Claude tool response', async () => {
    vi.stubGlobal(
      'fetch',
      mockClaudeIdeas([
        { title: 'Freestyle na dachu o wschodzie słońca', description: 'Nagraj krótki freestyle o poranku, kamera z dołu.' },
        { title: 'Reakcja na komentarz fana', description: 'Odczytaj i odpowiedz na komentarz w formie rymu.' },
      ]),
    );

    const result = await generateContentIdeas('Jestem raperem', recentPosts);

    expect(result).toHaveLength(2);
    expect(result?.[0].title).toContain('Freestyle');
  });

  it('caps at 3 ideas even if Claude returns more', async () => {
    vi.stubGlobal(
      'fetch',
      mockClaudeIdeas([
        { title: 'A', description: 'a' },
        { title: 'B', description: 'b' },
        { title: 'C', description: 'c' },
        { title: 'D', description: 'd' },
      ]),
    );

    const result = await generateContentIdeas(null, recentPosts);
    expect(result).toHaveLength(3);
  });

  it('redacts PII from recent post captions before sending to Claude', async () => {
    let capturedBody: { messages: Array<{ content: string }> } | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init!.body as string);
        return {
          ok: true,
          json: async () => ({
            content: [{ type: 'tool_use', name: 'suggest_content_ideas', input: { ideas: [{ title: 'x', description: 'y' }] } }],
          }),
        };
      }),
    );

    await generateContentIdeas(null, [
      { caption: 'kontakt: jan.kowalski@example.com', hashtags: [], title: null },
    ]);

    const sentText = capturedBody!.messages[0].content;
    expect(sentText).not.toContain('jan.kowalski@example.com');
  });

  it('returns null when Claude is not configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateContentIdeas('x', recentPosts);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when Claude returns an empty ideas list', async () => {
    vi.stubGlobal('fetch', mockClaudeIdeas([]));
    const result = await generateContentIdeas(null, recentPosts);
    expect(result).toBeNull();
  });
});
