import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callClaudeTool } from '@/lib/server/anthropic-client';

// Shared client for the AI-migration-from-OpenAI-to-Claude task (2026-09-13): every caller
// (Smart Autopilot classification, per-platform content generation) needs the same contract -
// unconfigured or failing -> null, so callers can fall back to a deterministic non-AI path.

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

const TOOL = {
  name: 'test_tool',
  description: 'test',
  input_schema: { type: 'object', properties: { value: { type: 'string' } } },
};

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  }
});

describe('callClaudeTool', () => {
  it('returns null immediately when ANTHROPIC_API_KEY is not set, without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await callClaudeTool({ model: 'x', system: 's', userContent: 'u', tool: TOOL });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the tool_use input on a successful response, with the right request shape', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let capturedBody: Record<string, unknown> | null = null;
    let capturedHeaders: Record<string, string> | null = null;

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init!.body as string);
      capturedHeaders = init!.headers as Record<string, string>;
      return {
        ok: true,
        json: async () => ({
          content: [{ type: 'tool_use', name: 'test_tool', input: { value: 'hello' } }],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await callClaudeTool<{ value: string }>({
      model: 'claude-haiku-4-5-20251001',
      system: 's',
      userContent: 'u',
      tool: TOOL,
    });

    expect(result).toEqual({ value: 'hello' });
    expect(capturedHeaders!['x-api-key']).toBe('test-key');
    expect(capturedHeaders!['anthropic-version']).toBeTruthy();
    expect(capturedBody).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      tool_choice: { type: 'tool', name: 'test_tool' },
    });
    expect(capturedBody!.tools).toEqual([{ name: 'test_tool', description: 'test', input_schema: TOOL.input_schema }]);
  });

  it('returns null when the response has no matching tool_use block', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'oops' }] }) }),
    );

    const result = await callClaudeTool({ model: 'x', system: 's', userContent: 'u', tool: TOOL });
    expect(result).toBeNull();
  });

  it('retries on a non-ok response then gives up, returning null', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await callClaudeTool({ model: 'x', system: 's', userContent: 'u', tool: TOOL, maxRetries: 1 });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
