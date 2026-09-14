import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateFacebookTextPostSuggestion } from '@/lib/server/content-suggestions';

// Proactive content suggestions (2026-09-14): agent-initiated Facebook text posts, requested
// explicitly by the product owner ("dobrze, ale niech posty tekstowe tez zachecaja do
// komentowania"). Never publishes on its own - see the webhook/notification-level tests for the
// approval gate; this covers the generation step in isolation.

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

const baseData = {
  postsThisWeek: 3,
  postsLastWeek: 1,
  engagementRateThisWeek: 0.2,
  engagementRateLastWeek: 0.1,
  newFansThisWeek: 5,
  salesThisWeekCents: 0,
  activeGoals: ['Publikować 3x w tygodniu'],
  followerGrowth: [{ platform: 'FACEBOOK', current: 500, weekAgo: 470, monthAgo: 400 }],
};

function claudeToolResponse(input: unknown) {
  return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'suggest_facebook_text_post', input }] }) };
}

describe('generateFacebookTextPostSuggestion', () => {
  it('returns the suggested post text when Claude can suggest one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        claudeToolResponse({
          canSuggest: true,
          postText: 'Ten tydzień był naprawdę dobry! Co sądzicie o ostatnim wydaniu - dajcie znać w komentarzu?',
        }),
      ),
    );

    const result = await generateFacebookTextPostSuggestion('Jestem raperem', baseData);
    expect(result).toBe('Ten tydzień był naprawdę dobry! Co sądzicie o ostatnim wydaniu - dajcie znać w komentarzu?');
  });

  it('returns null when Claude declines (canSuggest: false) rather than fabricating a post', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(claudeToolResponse({ canSuggest: false })));

    const result = await generateFacebookTextPostSuggestion(null, baseData);
    expect(result).toBeNull();
  });

  it('returns null when Claude is not configured, never publishing a fabricated fallback post', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateFacebookTextPostSuggestion('Jestem raperem', baseData);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the weekly performance data as JSON, not string-concatenated into the prompt', async () => {
    let capturedBody: { system?: string; messages?: Array<{ content?: string }> } | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { body?: string }) => {
        capturedBody = JSON.parse(init?.body ?? '{}');
        return claudeToolResponse({ canSuggest: true, postText: 'Dzięki za świetny tydzień! A jak wam mija ten?' });
      }),
    );

    await generateFacebookTextPostSuggestion('Prowadzę salon fryzjerski', baseData);

    const userContent = JSON.parse(capturedBody?.messages?.[0]?.content ?? '{}');
    expect(userContent.postsThisWeek).toBe(3);
    expect(userContent.activeGoals).toEqual(['Publikować 3x w tygodniu']);
    expect(capturedBody?.system).toContain('podanych danych');
  });
});
