import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// TASK-4.1.1/4.1.2: the LLM classification step now validates the parsed response against strict
// enum/range rules (beyond what forced tool_choice structurally guarantees), retries once with a
// correction note describing exactly what was wrong, and - if still invalid after 2 attempts -
// falls back to the pure heuristic classification (never saves an invalid plan) while emitting an
// alert (logError) instead of silently swallowing a repeating bad response.

const mockLogError = vi.fn();
const mockLogEvent = vi.fn();

vi.mock('@/lib/server/observability', () => ({
  logError: mockLogError,
  logEvent: mockLogEvent,
}));

const { analyzeInput } = await import('@/lib/server/smart-autopilot/analysis');

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

const baseInput = {
  rawInput: 'creator nagrywa nowy reel',
  timezone: 'Europe/Warsaw',
  mode: 'manual' as const,
  publishMode: 'draft' as const,
  idempotencyKey: 'idem-validation-test',
};

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  mockLogError.mockClear();
  mockLogEvent.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  }
});

function toolResponse(input: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({ content: [{ type: 'tool_use', name: 'classify_content', input }] }),
  };
}

describe('analyzeInput - LLM classification validation and retry', () => {
  it('accepts a valid response on the first attempt without retrying', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(toolResponse({ persona: 'video_creator', contentType: 'video', intent: 'promotional', confidence: 0.85 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeInput(baseInput, true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ persona: 'video_creator', contentType: 'video', intent: 'promotional', confidence: 0.85 });
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('retries once with a correction note when the first response has an invalid enum value', async () => {
    let capturedSecondBody: { messages: Array<{ content: string }> } | null = null;
    let callCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        callCount += 1;
        if (callCount === 1) {
          // "musician" is not a valid persona enum value - simulates a malformed LLM response.
          return toolResponse({ persona: 'musician', contentType: 'video', intent: 'promotional', confidence: 0.8 });
        }
        capturedSecondBody = JSON.parse(init!.body as string);
        return toolResponse({ persona: 'video_creator', contentType: 'video', intent: 'promotional', confidence: 0.8 });
      }),
    );

    const result = await analyzeInput(baseInput, true);

    expect(callCount).toBe(2);
    expect(result.persona).toBe('video_creator');

    const sentText = capturedSecondBody!.messages[0].content;
    expect(sentText).toContain('previousAttemptError');
    expect(sentText).toContain('persona');
  });

  it('falls back to heuristic classification and emits an alert when both attempts are invalid', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(toolResponse({ persona: 'musician', contentType: 'video', intent: 'promotional', confidence: 0.8 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeInput(baseInput, true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Never the invalid LLM value - heuristic fallback for this rawInput ("creator... reel").
    expect(result.persona).toBe('video_creator');
    expect(result.confidence).toBe(0.65);
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockLogError.mock.calls[0][1]).toBe('llm-classification-failed-after-retries');
  });

  it('falls back to heuristic classification when confidence is out of range', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(toolResponse({ persona: 'video_creator', contentType: 'video', intent: 'promotional', confidence: 5 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeInput(baseInput, true);

    expect(result.confidence).toBe(0.65);
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });
});
