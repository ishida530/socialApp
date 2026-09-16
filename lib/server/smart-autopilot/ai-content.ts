import { callClaudeTool, CLAUDE_MODELS } from '@/lib/server/anthropic-client';
import { redactPotentialPii } from './safety';
import type { AnalysisOutput, OrchestrateContentInput, PlatformBundle } from './types';

// Same per-platform caption limits the composer UI enforces client-side
// (components/composer/types.ts PLATFORM_CAPTION_LIMIT) - kept independently here since this
// is the server-side generation boundary, not a shared import across the client/server split.
const PLATFORM_CAPTION_LIMIT: Record<PlatformBundle['platform'], number> = {
  TIKTOK: 2200,
  INSTAGRAM: 2200,
  FACEBOOK: 63206,
  YOUTUBE: 5000,
  LINKEDIN: 3000,
};

// Deliberately NOT hardcoded to any one kind of account (originally assumed "mostly musicians/
// rappers", which produced mismatched tone/hashtags for e.g. a local business's account) -
// accountContext in userContent carries the actual description, and this prompt just tells
// Claude to use it.
const CONTENT_SYSTEM_PROMPT = [
  'Jestes asystentem piszacym posty social media dla wlasciciela konta opisanego w polu "accountContext" (jesli jest puste, pisz neutralnie, bez zakladania konkretnej branzy) - publikujacego krotkie wideo/zdjecia na kilku platformach naraz.',
  'Dopasuj ton, styl i dobor slow do accountContext - np. artysta/muzyk moze dostac luzniejszy, osobisty ton, lokalny biznes uslugowy (salon, gastronomia, nieruchomosci) bardziej rzeczowy ton z naciskiem na ofertę/korzysc dla klienta.',
  'Dla KAZDEJ platformy z listy "platforms" napisz OSOBNY tekst dopasowany do jej konwencji: TikTok (krotki, hook w pierwszej linii, luzny ton), Instagram (lifestyle, bardziej osobisty), YouTube (opisowy, wymaga tytulu), Facebook (bezposredni, informacyjny), LinkedIn (profesjonalny, biznesowy, ekspercki ton - BEZ luznego/nieformalnego slownictwa z TikToka/Instagrama, bez emoji-spamu, pelne zdania, moze byc dluzszy i bardziej rzeczowy niz na pozostalych platformach).',
  'Pisz po polsku, chyba ze opis tresci jest w innym jezyku - wtedy dopasuj jezyk do niego.',
  'Uzywaj KONKRETNEGO opisu tresci ktory dostales - nigdy generycznych fraz typu "Nowa publikacja" czy "Krotka aktualizacja".',
  'hashtags: 3-6 trafnych slow kluczowych, bez spacji, bez znaku #.',
  'title: wypelnij TYLKO dla platformy YOUTUBE, max 80 znakow.',
  'cta: krotkie, opcjonalne wezwanie do dzialania dopasowane do platformy.',
  // 2026-09-16 (zgloszenie wlasciciela: wygenerowana tresc brzmiala zbyt generycznie-motywacyjnie,
  // "pizdowato" dla jego konta) - communicationStyle to NADRZĘDNA instrukcja co do tonu/slownictwa,
  // wazniejsza niz ogolne dopasowanie tonu do accountContext w linii wyzej, kiedy jest podana.
  'Jesli w danych podano communicationStyle (styl wypowiedzi wlasciciela konta) - to NADRZĘDNA instrukcja co do tonu i slownictwa, wazniejsza niz cokolwiek innego w tym prompcie. Trzymaj sie jej doslownie.',
].join(' ');

type GeneratedBundlesToolResult = {
  bundles?: Array<{
    platform?: string;
    title?: string;
    caption?: string;
    hashtags?: string[];
    cta?: string;
  }>;
};

export async function generateBundlesWithClaude(
  analysis: AnalysisOutput,
  input: OrchestrateContentInput,
  targetPlatforms: PlatformBundle['platform'][],
  businessDescription?: string | null,
  communicationStyle?: string | null,
): Promise<PlatformBundle[] | null> {
  if (targetPlatforms.length === 0) {
    return null;
  }

  // PII is redacted BEFORE the description ever leaves our servers, same posture as the
  // pre-existing template fallback (transform.ts also redacts before using rawInput).
  const safeDescription = redactPotentialPii((input.rawInput || '').trim());
  const safeAccountContext = redactPotentialPii((businessDescription || '').trim());
  const safeCommunicationStyle = redactPotentialPii((communicationStyle || '').trim());

  const userContent = JSON.stringify({
    contentDescription: safeDescription || '(brak opisu od uzytkownika - napisz neutralny, chwytliwy tekst)',
    accountContext: safeAccountContext || '',
    communicationStyle: safeCommunicationStyle || '',
    persona: analysis.persona,
    intent: analysis.intent,
    contentType: analysis.contentType,
    platforms: targetPlatforms,
  });

  const result = await callClaudeTool<GeneratedBundlesToolResult>({
    scope: 'smart-autopilot-content',
    model: CLAUDE_MODELS.contentGeneration,
    system: CONTENT_SYSTEM_PROMPT,
    userContent,
    tool: {
      name: 'generate_platform_bundles',
      description: 'Generate one tailored social media post (caption, hashtags, optional title/cta) per requested platform.',
      input_schema: {
        type: 'object',
        properties: {
          bundles: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                platform: { type: 'string', enum: ['TIKTOK', 'INSTAGRAM', 'YOUTUBE', 'FACEBOOK', 'LINKEDIN'] },
                title: { type: 'string' },
                caption: { type: 'string' },
                hashtags: { type: 'array', items: { type: 'string' } },
                cta: { type: 'string' },
              },
              required: ['platform', 'caption', 'hashtags'],
            },
          },
        },
        required: ['bundles'],
      },
    },
    maxTokens: 2048,
    timeoutMs: 20000,
  });

  if (!result || !Array.isArray(result.bundles)) {
    return null;
  }

  const byPlatform = new Map(result.bundles.map((bundle) => [bundle.platform, bundle]));
  const ordered: PlatformBundle[] = [];

  // All-or-nothing: if the model skipped or malformed even one requested platform, fall back
  // to the template system for the WHOLE request rather than mixing AI and template output
  // inconsistently across platforms of the same post.
  for (const platform of targetPlatforms) {
    const bundle = byPlatform.get(platform);
    if (!bundle || typeof bundle.caption !== 'string' || !bundle.caption.trim() || !Array.isArray(bundle.hashtags)) {
      return null;
    }

    ordered.push({
      platform,
      title: bundle.title?.trim() ? bundle.title.trim().slice(0, 100) : undefined,
      caption: bundle.caption.trim().slice(0, PLATFORM_CAPTION_LIMIT[platform]),
      hashtags: bundle.hashtags
        .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        .slice(0, 8)
        .map((tag) => tag.trim().replace(/^#/, '')),
      cta: bundle.cta?.trim() ? bundle.cta.trim().slice(0, 200) : undefined,
    });
  }

  return ordered;
}
