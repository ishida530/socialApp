import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Caption-quality eval (2026-10-02, AI review). Runs every case in captions.dataset.json through the
// real post-copy generator, checks hard rules in code and asks a judge model to score the result.
// Run before changing the prompt or the model:
//   npm run eval:captions
//   EVAL_MODELS=claude-sonnet-5,claude-sonnet-5-5 npm run eval:captions   (compare models)
// Needs ANTHROPIC_API_KEY; costs roughly a few US cents per case and model. See evals/README.md.

// The generator records token usage in the database - not needed (or available) here.
vi.mock('@/lib/server/claude-usage', () => ({ recordClaudeUsage: async () => {} }));
vi.mock('@/lib/server/ai-alerts', () => ({ reportAiProviderProblem: async () => {} }));

const { generateBundlesWithClaude } = await import('@/lib/server/smart-autopilot/ai-content');
const { callClaudeTool, CLAUDE_MODELS } = await import('@/lib/server/anthropic-client');

type EvalCase = {
  id: string;
  note: string;
  accountContext: string;
  communicationStyle?: string;
  platforms: Array<'TIKTOK' | 'INSTAGRAM' | 'YOUTUBE' | 'FACEBOOK' | 'LINKEDIN'>;
  facts: string[];
  forbidden?: string[];
  imageUrl?: string;
};

type JudgeScores = {
  concreteness: number;
  faithfulness: number;
  platformFit: number;
  tone: number;
  language: number;
  comment: string;
};

const dataset = JSON.parse(readFileSync(path.join(__dirname, 'captions.dataset.json'), 'utf8')) as EvalCase[];
const models = (process.env.EVAL_MODELS || CLAUDE_MODELS.contentGeneration).split(',').map((m) => m.trim()).filter(Boolean);
const judgeModel = process.env.EVAL_JUDGE_MODEL || 'claude-sonnet-5';
const minScore = Number(process.env.EVAL_MIN_SCORE || 3.5);
const onlyCase = process.env.EVAL_CASE;

const LIMITS = { TIKTOK: 2200, INSTAGRAM: 2200, FACEBOOK: 63206, YOUTUBE: 5000, LINKEDIN: 3000 } as const;
const BANNED_PHRASES = ['krótka aktualizacja', 'hook w 1 sekundzie', 'nowa publikacja', 'lifestyle cut', 'shorts briefing'];

const JUDGE_PROMPT = [
  'Oceniasz posty social media wygenerowane przez AI dla polskiego narzedzia do planowania publikacji.',
  'Dostajesz dane wejsciowe (notatka uzytkownika, opis konta, styl) i wygenerowane posty per platforma.',
  'Ocen w skali 1-5 (5 = swietnie):',
  'concreteness - czy tekst mowi konkretnie o tresci z notatki, bez pustych ogolnikow;',
  'faithfulness - czy NIE ma zmyslonych faktow, liczb, cen, dat, cech ani obietnic, ktorych nie ma w danych (5 = zero zmyslen);',
  'platformFit - czy kazdy tekst pasuje do konwencji swojej platformy (dlugosc, ton, LinkedIn profesjonalnie, TikTok krotko z hookiem);',
  'tone - czy ton pasuje do opisu konta i stylu wypowiedzi, jesli podano;',
  'language - poprawnosc jezykowa (polski albo jezyk notatki), naturalnosc.',
  'Badz surowy i konsekwentny. comment: jedno zdanie o najwiekszym problemie.',
].join(' ');

const results: Array<{ model: string; id: string; scores: JudgeScores | null; failures: string[]; factCoverage: number }> = [];

function normalize(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

async function judge(evalCase: EvalCase, posts: unknown) {
  return callClaudeTool<JudgeScores>({
    scope: 'eval-judge',
    model: judgeModel,
    system: JUDGE_PROMPT,
    userContent: JSON.stringify({
      input: { note: evalCase.note, accountContext: evalCase.accountContext, communicationStyle: evalCase.communicationStyle ?? '' },
      posts,
    }),
    tool: {
      name: 'score_posts',
      description: 'Score the generated posts.',
      input_schema: {
        type: 'object',
        properties: {
          concreteness: { type: 'integer', minimum: 1, maximum: 5 },
          faithfulness: { type: 'integer', minimum: 1, maximum: 5 },
          platformFit: { type: 'integer', minimum: 1, maximum: 5 },
          tone: { type: 'integer', minimum: 1, maximum: 5 },
          language: { type: 'integer', minimum: 1, maximum: 5 },
          comment: { type: 'string' },
        },
        required: ['concreteness', 'faithfulness', 'platformFit', 'tone', 'language', 'comment'],
      },
    },
    maxTokens: 400,
    timeoutMs: 60_000,
  });
}

const enabled = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!enabled)('caption generation eval', () => {
  for (const model of models) {
    for (const evalCase of dataset.filter((c) => !onlyCase || c.id === onlyCase)) {
      it(`${model} :: ${evalCase.id}`, async () => {
        CLAUDE_MODELS.contentGeneration = model;
        const bundles = await generateBundlesWithClaude(
          { persona: 'neutral', contentType: evalCase.imageUrl ? 'image' : 'text', intent: 'unknown', confidence: 1, safetyFlags: [], unknownAspectRatio: true, aspectRatioConfidence: 0.3 },
          {
            rawInput: evalCase.note,
            timezone: 'Europe/Warsaw',
            mode: 'manual',
            publishMode: 'draft',
            idempotencyKey: `eval-${evalCase.id}`,
            ...(evalCase.imageUrl ? { imageUrls: [evalCase.imageUrl] } : {}),
          },
          evalCase.platforms,
          evalCase.accountContext,
          evalCase.communicationStyle ?? null,
        );

        const failures: string[] = [];
        if (!bundles) {
          failures.push('generator returned null (API error or malformed response)');
          results.push({ model, id: evalCase.id, scores: null, failures, factCoverage: 0 });
          expect(failures).toEqual([]);
          return;
        }

        for (const bundle of bundles) {
          const text = normalize(`${bundle.title ?? ''} ${bundle.caption} ${bundle.cta ?? ''}`);
          if (!bundle.caption.trim()) failures.push(`${bundle.platform}: empty caption`);
          if (bundle.caption.length > LIMITS[bundle.platform]) failures.push(`${bundle.platform}: over the caption limit`);
          if (/\[\[|redacted/i.test(bundle.caption)) failures.push(`${bundle.platform}: leaked mask token`);
          if (bundle.hashtags.length < 1 || bundle.hashtags.length > 8) failures.push(`${bundle.platform}: ${bundle.hashtags.length} hashtags`);
          if (bundle.platform === 'YOUTUBE' && !bundle.title) failures.push('YOUTUBE: missing title');
          for (const phrase of BANNED_PHRASES) if (text.includes(normalize(phrase))) failures.push(`${bundle.platform}: banned phrase "${phrase}"`);
          for (const word of evalCase.forbidden ?? []) if (text.includes(normalize(word))) failures.push(`${bundle.platform}: forbidden "${word}"`);
        }

        const allText = normalize(bundles.map((b) => `${b.title ?? ''} ${b.caption}`).join(' '));
        const factCoverage = evalCase.facts.length
          ? evalCase.facts.filter((fact) => allText.includes(normalize(fact))).length / evalCase.facts.length
          : 1;

        const scores = await judge(evalCase, bundles);
        results.push({ model, id: evalCase.id, scores, failures, factCoverage });

        expect(failures).toEqual([]);
      });
    }
  }

  afterAll(() => {
    if (results.length === 0) return;

    const lines = [`# Caption eval ${new Date().toISOString()}`, '', `Judge: ${judgeModel}. Minimum average score: ${minScore}.`, ''];
    for (const model of models) {
      const rows = results.filter((r) => r.model === model);
      const scored = rows.filter((r) => r.scores);
      const avg = (key: keyof Omit<JudgeScores, 'comment'>) =>
        scored.length ? scored.reduce((sum, r) => sum + (r.scores![key] as number), 0) / scored.length : 0;
      const overall = (avg('concreteness') + avg('faithfulness') + avg('platformFit') + avg('tone') + avg('language')) / 5;
      const coverage = rows.reduce((sum, r) => sum + r.factCoverage, 0) / Math.max(rows.length, 1);

      lines.push(
        `## ${model}`,
        '',
        `Overall ${overall.toFixed(2)} | concreteness ${avg('concreteness').toFixed(2)} | faithfulness ${avg('faithfulness').toFixed(2)} | ` +
          `platformFit ${avg('platformFit').toFixed(2)} | tone ${avg('tone').toFixed(2)} | language ${avg('language').toFixed(2)} | ` +
          `fact coverage ${(coverage * 100).toFixed(0)}% | hard-rule failures ${rows.filter((r) => r.failures.length).length}/${rows.length}`,
        '',
        '| case | C | F | P | T | L | facts | failures / judge comment |',
        '|---|---|---|---|---|---|---|---|',
        ...rows.map((r) =>
          `| ${r.id} | ${r.scores?.concreteness ?? '-'} | ${r.scores?.faithfulness ?? '-'} | ${r.scores?.platformFit ?? '-'} | ` +
          `${r.scores?.tone ?? '-'} | ${r.scores?.language ?? '-'} | ${(r.factCoverage * 100).toFixed(0)}% | ` +
          `${[...r.failures, r.scores?.comment ?? ''].filter(Boolean).join('; ').replace(/\|/g, '/')} |`,
        ),
        '',
      );

      if (scored.length > 0 && overall < minScore) {
        lines.push(`**${model}: average ${overall.toFixed(2)} is below ${minScore}.**`, '');
        process.exitCode = 1;
      }
    }

    const dir = path.join(__dirname, 'results');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `captions-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
    writeFileSync(file, lines.join('\n'));
    console.log(lines.join('\n'));
    console.log(`\nReport: ${file}`);
  });
});

describe.skipIf(enabled)('caption generation eval (skipped)', () => {
  it('needs ANTHROPIC_API_KEY', () => {
    console.warn('Set ANTHROPIC_API_KEY to run the caption eval.');
  });
});
