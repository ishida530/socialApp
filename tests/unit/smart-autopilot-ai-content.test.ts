import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateBundlesWithClaude } from '@/lib/server/smart-autopilot/ai-content';
import type { AnalysisOutput, OrchestrateContentInput } from '@/lib/server/smart-autopilot/types';

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

const analysis: AnalysisOutput = {
  persona: 'video_creator',
  contentType: 'video',
  intent: 'promotional',
  confidence: 0.8,
  safetyFlags: [],
  unknownAspectRatio: false,
  aspectRatioConfidence: 0.9,
};

const baseInput: OrchestrateContentInput = {
  rawInput: 'Nowy freestyle o mieście nocą, nagrany na dachu',
  timezone: 'Europe/Warsaw',
  mode: 'manual',
  publishMode: 'draft',
  idempotencyKey: 'idem-key-12345',
};

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

function mockClaudeToolResponse(bundles: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content: [{ type: 'tool_use', name: 'generate_platform_bundles', input: { bundles } }] }),
  });
}

describe('generateBundlesWithClaude', () => {
  it('returns null immediately for an empty platform list, without calling Claude', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateBundlesWithClaude(analysis, baseInput, []);

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redacts PII from rawInput before it is sent to Claude', async () => {
    let capturedBody: { messages: Array<{ content: string }> } | null = null;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init!.body as string);
      return {
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'tool_use',
              name: 'generate_platform_bundles',
              input: { bundles: [{ platform: 'TIKTOK', caption: 'x', hashtags: ['a'] }] },
            },
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateBundlesWithClaude(
      analysis,
      { ...baseInput, rawInput: 'kontakt: jan.kowalski@example.com albo 512-345-678' },
      ['TIKTOK'],
    );

    const sentText = capturedBody!.messages[0].content;
    expect(sentText).not.toContain('jan.kowalski@example.com');
    expect(sentText).not.toContain('512-345-678');
  });

  it('returns a bundle per requested platform, with hashtags cleaned and captions truncated to platform limits', async () => {
    vi.stubGlobal(
      'fetch',
      mockClaudeToolResponse([
        { platform: 'TIKTOK', caption: 'Nowy freestyle o miescie noca!', hashtags: ['#rap', 'freestyle'], cta: 'Sluchaj teraz' },
        { platform: 'INSTAGRAM', caption: 'Nagrane na dachu, klimat miasta.', hashtags: ['rap', 'muzyka'] },
      ]),
    );

    const result = await generateBundlesWithClaude(analysis, baseInput, ['TIKTOK', 'INSTAGRAM']);

    expect(result).toEqual([
      { platform: 'TIKTOK', title: undefined, caption: 'Nowy freestyle o miescie noca!', hashtags: ['rap', 'freestyle'], cta: 'Sluchaj teraz' },
      { platform: 'INSTAGRAM', title: undefined, caption: 'Nagrane na dachu, klimat miasta.', hashtags: ['rap', 'muzyka'], cta: undefined },
    ]);
  });

  it('returns null (falls back to templates) when the response is missing a requested platform', async () => {
    vi.stubGlobal(
      'fetch',
      mockClaudeToolResponse([{ platform: 'TIKTOK', caption: 'only tiktok', hashtags: ['a'] }]),
    );

    const result = await generateBundlesWithClaude(analysis, baseInput, ['TIKTOK', 'INSTAGRAM']);
    expect(result).toBeNull();
  });

  it('threads businessDescription into the Claude request as accountContext, redacted for PII', async () => {
    let capturedBody: { messages: Array<{ content: string }> } | null = null;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init!.body as string);
      return {
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'tool_use',
              name: 'generate_platform_bundles',
              input: { bundles: [{ platform: 'TIKTOK', caption: 'x', hashtags: ['a'] }] },
            },
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateBundlesWithClaude(
      analysis,
      baseInput,
      ['TIKTOK'],
      'Prowadzę salon kosmetyczny, kontakt: jan.kowalski@example.com',
    );

    const sentText = capturedBody!.messages[0].content;
    expect(sentText).toContain('Prowadzę salon kosmetyczny');
    expect(sentText).not.toContain('jan.kowalski@example.com');
  });

  it('sends an empty accountContext when no businessDescription is provided, without erroring', async () => {
    vi.stubGlobal(
      'fetch',
      mockClaudeToolResponse([{ platform: 'TIKTOK', caption: 'x', hashtags: ['a'] }]),
    );

    const result = await generateBundlesWithClaude(analysis, baseInput, ['TIKTOK'], null);
    expect(result).not.toBeNull();
  });

  it('accepts LINKEDIN as a requested platform and truncates its caption to the LinkedIn limit (3000 chars)', async () => {
    const longCaption = 'x'.repeat(3100);
    vi.stubGlobal(
      'fetch',
      mockClaudeToolResponse([{ platform: 'LINKEDIN', caption: longCaption, hashtags: ['nieruchomosci'] }]),
    );

    const result = await generateBundlesWithClaude(analysis, baseInput, ['LINKEDIN']);

    expect(result).not.toBeNull();
    expect(result![0].platform).toBe('LINKEDIN');
    expect(result![0].caption.length).toBe(3000);
  });

  // 2026-09-16 (drugie konto testowe - biuro nieruchomości, LinkedIn jako platforma biznesowa):
  // właściciel wprost potwierdził, że LinkedIn ma brzmieć INACZEJ niż TikTok/Instagram/Facebook,
  // nie kolejnym luznym tonem - blokuje to wprost w systemowym prompcie, nie tylko w komentarzu.
  it('tells Claude LinkedIn needs a distinct, professional tone - not the same casual tone as TikTok/Instagram/Facebook', async () => {
    let capturedBody: { system: string } | null = null;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init!.body as string);
      return {
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'tool_use',
              name: 'generate_platform_bundles',
              input: { bundles: [{ platform: 'LINKEDIN', caption: 'x', hashtags: ['a'] }] },
            },
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateBundlesWithClaude(analysis, baseInput, ['LINKEDIN']);

    expect(capturedBody!.system).toContain('LinkedIn');
    expect(capturedBody!.system).toMatch(/profesjonaln|biznesow/i);
  });

  it('returns null when Claude is not configured (no API key)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateBundlesWithClaude(analysis, baseInput, ['TIKTOK']);

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
