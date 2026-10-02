import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// AI review fixes (2026-10-02) - one test group per finding.

const { createContactMasker, redactPotentialPii } = await import('@/lib/server/smart-autopilot/safety');
const { generateBundlesWithClaude } = await import('@/lib/server/smart-autopilot/ai-content');
const { transformByPersona } = await import('@/lib/server/smart-autopilot/transform');
const { analyzeInput } = await import('@/lib/server/smart-autopilot/analysis');
const { callClaudeTool, callClaudeAgentTurn } = await import('@/lib/server/anthropic-client');
const { classifyProviderFailure } = await import('@/lib/server/ai-alerts');
const { captionSimilarity } = await import('@/lib/server/claude-usage');
const { runMentorTurn } = await import('@/lib/server/telegram-mentor-agent');
const { generatePlatformBundles } = await import('@/lib/server/composer-drafts');
const { resolveAppMode } = await import('@/lib/server/app-mode');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser } = await import('../helpers/fixtures');

import type { AnalysisOutput, OrchestrateContentInput } from '@/lib/server/smart-autopilot/types';

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
const cleanup: string[] = [];

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  for (const id of cleanup.splice(0)) await deleteTestUser(id);
});

const analysis: AnalysisOutput = {
  persona: 'video_creator',
  contentType: 'image',
  intent: 'promotional',
  confidence: 0.8,
  safetyFlags: [],
  unknownAspectRatio: true,
  aspectRatioConfidence: 0.3,
};

const input: OrchestrateContentInput = {
  rawInput: 'Nowość: laminacja brwi, 149 zł',
  timezone: 'Europe/Warsaw',
  mode: 'manual',
  publishMode: 'draft',
  idempotencyKey: 'ai-review-test',
};

function toolResponse(bundles: unknown, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'tool_use', name: 'generate_platform_bundles', input: { bundles } }], ...extra }),
  };
}

function errorResponse(status: number, type = 'api_error', message = 'boom') {
  return { ok: false, status, headers: new Headers(), json: async () => ({ error: { type, message } }) };
}

describe('1. contact details: masked for the AI, restored in the post', () => {
  it('masks every email and phone, not just the first one', () => {
    const masker = createContactMasker();
    const masked = masker.mask('a@x.pl, b@y.pl, tel 600 100 200 albo +48 512-345-678');
    expect(masked).not.toMatch(/@|600 100 200|512-345-678/);
    expect(masked).toContain('[[EMAIL_2]]');
    expect(masked).toContain('[[TEL_4]]');
  });

  it('leaves prices, dates and postal codes alone', () => {
    const text = 'Cena 689 000 zł, 450000 zł, odbiór 2026-09-28, kod 00-950, 62 m2';
    expect(createContactMasker().mask(text)).toBe(text);
    expect(redactPotentialPii(text)).toBe(text);
  });

  it('restores real values and drops tokens the model invented', () => {
    const masker = createContactMasker();
    masker.mask('dzwoń 600 100 200');
    expect(masker.restore('Zadzwoń: [[TEL_1]] [[TEL_9]]')).toBe('Zadzwoń: 600 100 200');
  });

  it('the generator never sends the phone to the API but puts it back into the caption', async () => {
    let sent = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        sent = init!.body as string;
        return toolResponse([{ platform: 'FACEBOOK', caption: 'Zapisy: [[TEL_1]]', hashtags: ['brwi'] }]);
      }),
    );

    const result = await generateBundlesWithClaude(analysis, { ...input, rawInput: 'zapisy tel 600 100 200' }, ['FACEBOOK']);

    expect(sent).not.toContain('600 100 200');
    expect(result![0].caption).toBe('Zapisy: 600 100 200');
  });
});

describe('5-7. generator request: image, previous version, no misleading persona', () => {
  it('sends the image as a content block, with the previous caption and without persona/intent', async () => {
    let body: { messages: Array<{ content: unknown }> } | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        body = JSON.parse(init!.body as string);
        return toolResponse([{ platform: 'INSTAGRAM', caption: 'Nowa wersja', hashtags: ['brwi'] }]);
      }),
    );

    await generateBundlesWithClaude(
      analysis,
      { ...input, imageUrls: ['https://blob.example.com/photo.jpeg'], previousCaption: 'Stara wersja' },
      ['INSTAGRAM'],
    );

    const content = body!.messages[0].content as Array<{ type: string; source?: { url: string }; text?: string }>;
    expect(content[0]).toEqual({ type: 'image', source: { type: 'url', url: 'https://blob.example.com/photo.jpeg' } });
    const promptData = JSON.parse(content[1].text!);
    expect(promptData.previousVersion).toBe('Stara wersja');
    expect(promptData).not.toHaveProperty('persona');
    expect(promptData).not.toHaveProperty('intent');
  });

  it('retries without the image when the image request fails', async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(init!.body as string);
        return bodies.length === 1
          ? errorResponse(400, 'invalid_request_error', 'Could not process image')
          : toolResponse([{ platform: 'INSTAGRAM', caption: 'Tekst', hashtags: ['a'] }]);
      }),
    );

    const result = await generateBundlesWithClaude(analysis, { ...input, imageUrls: ['https://blob.example.com/p.png'] }, ['INSTAGRAM']);

    expect(result![0].caption).toBe('Tekst');
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).not.toContain('"type":"image"');
  });

  it('skips unsupported image formats (e.g. HEIC) instead of failing the request', async () => {
    let sent = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        sent = init!.body as string;
        return toolResponse([{ platform: 'INSTAGRAM', caption: 'x', hashtags: ['a'] }]);
      }),
    );

    await generateBundlesWithClaude(analysis, { ...input, imageUrls: ['https://blob.example.com/p.heic'] }, ['INSTAGRAM']);
    expect(sent).not.toContain('"type":"image"');
  });

  it('classifies Polish notes instead of calling everything "neutral"', async () => {
    const realEstate = await analyzeInput({ ...input, rawInput: 'mieszkanie 3 pokoje 62 m2 na sprzedaż' }, false);
    const shop = await analyzeInput({ ...input, rawInput: 'nowa kolekcja w sklepie, darmowa dostawa' }, false);
    const tiktokMention = await analyzeInput({ ...input, rawInput: 'wrzucam to też na tiktok' }, false);
    expect(realEstate.persona).toBe('real_estate_agent');
    expect(shop.persona).toBe('ecommerce_owner');
    expect(tiktokMention.persona).toBe('neutral');
  });
});

describe('3. retries only transient failures', () => {
  const TOOL = { name: 't', description: 't', input_schema: { type: 'object', properties: {} } };

  it('does not retry a 400 (e.g. exhausted credit balance)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(400, 'invalid_request_error', 'Your credit balance is too low'));
    vi.stubGlobal('fetch', fetchMock);

    expect(await callClaudeTool({ scope: 'x', model: 'm', system: 's', userContent: 'u', tool: TOOL })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries an overloaded API (529) and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(529, 'overloaded_error'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ content: [{ type: 'tool_use', name: 't', input: { ok: 1 } }] }) });
    vi.stubGlobal('fetch', fetchMock);

    expect(await callClaudeTool({ scope: 'x', model: 'm', system: 's', userContent: 'u', tool: TOOL })).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('4. template fallback', () => {
  it("keeps the user's note as-is, with no copywriting prefixes", () => {
    const bundles = transformByPersona(analysis, { ...input, rawInput: 'reklamacja — wypadająca listwa, tel 600 100 200' });
    for (const bundle of bundles) {
      expect(bundle.caption).toBe('reklamacja — wypadająca listwa, tel 600 100 200');
    }
    expect(bundles.find((b) => b.platform === 'YOUTUBE')?.title).toBeTruthy();
  });
});

describe('8. provider alerts', () => {
  it('flags account-level problems and ignores transient ones', () => {
    expect(classifyProviderFailure({ status: 400, type: 'invalid_request_error', message: 'Your credit balance is too low' })).toMatch(/środki/);
    expect(classifyProviderFailure({ status: 401, type: 'authentication_error', message: 'invalid x-api-key' })).toMatch(/Klucz/);
    expect(classifyProviderFailure({ status: 529, type: 'overloaded_error', message: 'Overloaded' })).toBeNull();
  });
});

describe('10. prompt caching for the mentor agent', () => {
  it('marks the system prompt and the last tool as cache breakpoints', async () => {
    let body: { system: Array<{ cache_control?: unknown }>; tools: Array<{ cache_control?: unknown }> } | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        body = JSON.parse(init!.body as string);
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'ok' }] }) };
      }),
    );

    await callClaudeAgentTurn({
      scope: 'x',
      model: 'm',
      system: 's',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [
        { name: 'a', description: 'a', input_schema: {} },
        { name: 'b', description: 'b', input_schema: {} },
      ],
    });

    expect(body!.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(body!.tools[0].cache_control).toBeUndefined();
    expect(body!.tools[1].cache_control).toEqual({ type: 'ephemeral' });
  });
});

describe('2. mentor agent never hides a write it already made', () => {
  it('reports the saved fan when the tool rounds run out and the wrap-up fails', async () => {
    const { user } = await createTestUser();
    cleanup.push(user.id);

    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls <= 3) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: [{ type: 'tool_use', id: `t${calls}`, name: calls === 1 ? 'add_fan' : 'get_status', input: calls === 1 ? { email: 'fan@example.com' } : {} }],
              stop_reason: 'tool_use',
            }),
          };
        }
        return errorResponse(500);
      }),
    );

    const reply = await runMentorTurn(user.id, 'dodaj fana fan@example.com');

    expect(reply).toContain('Zapisałem');
    expect(reply).toContain('fan@example.com');
    expect(await prisma.fan.count({ where: { userId: user.id } })).toBe(1);
  });
});

describe('9. monthly AI generation quota', () => {
  it('skips the AI call once the plan quota is used up (commercial mode)', async () => {
    const { user } = await createTestUser({ emailVerifiedAt: null });
    cleanup.push(user.id);
    const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    await prisma.usageCounter.create({ data: { userId: user.id, metric: 'ai_generations', periodStart, count: 1000 } });

    const fetchMock = vi.fn().mockResolvedValue(toolResponse([{ platform: 'FACEBOOK', caption: 'AI', hashtags: ['a'] }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generatePlatformBundles(user.id, {
      rawInput: 'notatka',
      targetPlatforms: ['FACEBOOK'],
      timezone: 'Europe/Warsaw',
      idempotencyKey: `quota-${user.id}`,
    });

    if (resolveAppMode() === 'personal') {
      expect(result.aiGenerated).toBe(true);
    } else {
      expect(result).toMatchObject({ aiGenerated: false, aiUnavailableReason: 'quota' });
      expect(result.bundlesByPlatform.get('FACEBOOK')?.caption).toBe('notatka');
    }
  });
});

describe('13. quality metric', () => {
  it('scores word overlap between the AI caption and the published one', () => {
    expect(captionSimilarity('Nowa laminacja brwi', 'Nowa laminacja brwi')).toBe(1);
    expect(captionSimilarity('Nowa laminacja brwi', 'coś zupełnie innego')).toBe(0);
    expect(captionSimilarity('a b c d', 'a b x y')).toBeCloseTo(2 / 6);
  });
});
