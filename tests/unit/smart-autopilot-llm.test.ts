import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refineClassificationWithLlm } from '@/lib/server/smart-autopilot/llm';

// Migrated off OpenAI to Claude (2026-09-13) - this call site used to hit
// api.openai.com/v1/chat/completions with response_format json_object; now it goes through
// the shared Anthropic tool-use client. External contract (input/output shape, null-on-failure)
// is unchanged, so callers (analysis.ts) needed no changes.

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

describe('refineClassificationWithLlm', () => {
  it('calls the Anthropic Messages API (not OpenAI) and returns the parsed classification', async () => {
    let capturedUrl = '';
    const fetchMock = vi.fn(async (url: string) => {
      capturedUrl = url.toString();
      return {
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'tool_use',
              name: 'classify_content',
              input: { persona: 'video_creator', contentType: 'video', intent: 'promotional', confidence: 0.9 },
            },
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await refineClassificationWithLlm({
      textSample: 'Nowy klip z sesji nagraniowej',
      heuristicPersona: 'video_creator',
      heuristicContentType: 'video',
      heuristicIntent: 'promotional',
    });

    expect(capturedUrl).toContain('anthropic.com');
    expect(result).toEqual({ persona: 'video_creator', contentType: 'video', intent: 'promotional', confidence: 0.9 });
  });

  it('returns null without an ANTHROPIC_API_KEY, without calling fetch', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await refineClassificationWithLlm({
      textSample: 'x',
      heuristicPersona: 'neutral',
      heuristicContentType: 'unknown',
      heuristicIntent: 'unknown',
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
