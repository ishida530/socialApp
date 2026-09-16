import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMUNICATION_STYLE_STARTER_TEMPLATE, suggestCommunicationStyle } from '@/lib/server/communication-style';

// AI-assisted "communication style" suggestion (2026-09-16, owner report: an AI-generated post
// suggestion sounded generic/off-brand - see lib/server/communication-style.ts header comment).
// Deliberately never fabricates a voice from an empty draft - only refines what the user already
// wrote, matching the app's established "AI suggests, human approves" pattern.

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

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

function claudeToolResponse(input: unknown) {
  return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'refine_communication_style', input }] }) };
}

describe('suggestCommunicationStyle', () => {
  it('returns a static starter template for an empty draft, without calling Claude', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await suggestCommunicationStyle('', 'Jestem raperem');
    expect(result).toBe(COMMUNICATION_STYLE_STARTER_TEMPLATE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the starter template for a whitespace-only draft, without calling Claude', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await suggestCommunicationStyle('   ', null);
    expect(result).toBe(COMMUNICATION_STYLE_STARTER_TEMPLATE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a non-empty draft to Claude and returns the refined styleDescription', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        claudeToolResponse({ styleDescription: 'Pisz bezpośrednio, bez lania wody, mów "ziomy".' }),
      ),
    );

    const result = await suggestCommunicationStyle('bez lania wody, mowie ziomy', 'Jestem raperem');
    expect(result).toBe('Pisz bezpośrednio, bez lania wody, mów "ziomy".');
  });

  it('sends the draft and account context as JSON, not string-concatenated', async () => {
    let capturedBody: { system?: string; messages?: Array<{ content?: string }> } | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { body?: string }) => {
        capturedBody = JSON.parse(init?.body ?? '{}');
        return claudeToolResponse({ styleDescription: 'Krótko i konkretnie.' });
      }),
    );

    await suggestCommunicationStyle('krotko i konkretnie', 'Jestem raperem');

    const userContent = JSON.parse(capturedBody?.messages?.[0]?.content ?? '{}');
    expect(userContent.draft).toBe('krotko i konkretnie');
    expect(userContent.accountContext).toBe('Jestem raperem');
  });

  it('falls back to the raw trimmed draft when Claude is not configured, never fabricating a style', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await suggestCommunicationStyle('  bez lania wody  ', 'Jestem raperem');
    expect(result).toBe('bez lania wody');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the raw trimmed draft when Claude fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    const result = await suggestCommunicationStyle('bez lania wody', 'Jestem raperem');
    expect(result).toBe('bez lania wody');
  });

  it('falls back to the raw trimmed draft when Claude returns an empty styleDescription', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(claudeToolResponse({ styleDescription: '   ' })));

    const result = await suggestCommunicationStyle('bez lania wody', 'Jestem raperem');
    expect(result).toBe('bez lania wody');
  });
});
