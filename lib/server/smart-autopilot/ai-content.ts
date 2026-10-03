import { callClaudeTool, CLAUDE_MODELS, type AnthropicUserContentBlock } from '@/lib/server/anthropic-client';
import { createContactMasker } from './safety';
import type { AnalysisOutput, OrchestrateContentInput, PlatformBundle } from './types';
import type { PlatformStyleGuides } from '@/lib/server/platform-style-guides';

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

// Formats the Messages API accepts as image input.
const SUPPORTED_IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp)(\?|$)/i;
const MAX_IMAGES = 3;

// Deliberately NOT hardcoded to any one kind of account (originally assumed "mostly musicians/
// rappers", which produced mismatched tone/hashtags for e.g. a local business's account) -
// accountContext in userContent carries the actual description, and this prompt just tells
// Claude to use it.
export const CONTENT_SYSTEM_PROMPT = [
  'Jestes asystentem piszacym posty social media dla wlasciciela konta opisanego w polu "accountContext" (jesli jest puste, pisz neutralnie, bez zakladania konkretnej branzy) - publikujacego krotkie wideo/zdjecia na kilku platformach naraz.',
  'Dopasuj ton, styl i dobor slow do accountContext - np. artysta/muzyk moze dostac luzniejszy, osobisty ton, lokalny biznes uslugowy (salon, gastronomia, nieruchomosci) bardziej rzeczowy ton z naciskiem na ofertę/korzysc dla klienta.',
  'Dla KAZDEJ platformy z listy "platforms" napisz OSOBNY tekst dopasowany do jej konwencji: TikTok (krotki, hook w pierwszej linii, luzny ton), Instagram (lifestyle, bardziej osobisty), YouTube (opisowy, wymaga tytulu), Facebook (bezposredni, informacyjny), LinkedIn (profesjonalny, biznesowy, ekspercki ton - BEZ luznego/nieformalnego slownictwa z TikToka/Instagrama, bez emoji-spamu, pelne zdania, moze byc dluzszy i bardziej rzeczowy niz na pozostalych platformach).',
  'Pisz po polsku, chyba ze opis tresci jest w innym jezyku - wtedy dopasuj jezyk do niego.',
  'Uzywaj KONKRETNEGO opisu tresci ktory dostales - nigdy generycznych fraz typu "Nowa publikacja" czy "Krotka aktualizacja".',
  // 2026-10-02 (AI review): the photo / video thumbnail is attached when available.
  'Jesli dolaczono obraz, to jest to zdjecie lub kadr z publikowanego materialu: opisz to, co faktycznie na nim widac, i polacz to z opisem tresci. Nie zgaduj marek, nazwisk ani miejsc, ktorych nie da sie jednoznacznie rozpoznac.',
  // 2026-10-02: contact details are masked before they leave our servers.
  'Tokeny w podwojnych nawiasach kwadratowych, np. [[TEL_1]] albo [[EMAIL_1]], to zamaskowane dane kontaktowe wlasciciela konta. Jesli dana informacja pasuje do posta, przepisz token DOKLADNIE w tej postaci (zostanie podmieniony na prawdziwe dane). Nigdy nie wymyslaj wlasnych numerow, adresow ani tokenow.',
  // 2026-10-03 (caption eval, faithfulness 3.85/5): the model kept adding plausible but unstated
  // details ("liczba miejsc ograniczona", "chrupiaca skorka", invented legal specifics) and left
  // empty contact placeholders when the note had no phone number.
  'FAKTY: uzywaj tylko faktow z opisu tresci, accountContext i obrazu. Nie dopisuj cech produktu, liczb, terminow, cen, gwarancji, ograniczen ("liczba miejsc ograniczona", "tylko dzis"), szczegolow technicznych ani prawnych, ktorych tam nie ma. Mozesz pisac o emocjach i korzysciach ogolnie, ale bez nowych faktow.',
  'Nigdy nie zostawiaj miejsc do uzupelnienia ani placeholderow typu [telefon], [link], [adres], XXX. Jesli brak danych kontaktowych, napisz wezwanie do dzialania bez nich (np. "napisz do nas w wiadomosci").',
  'Jesli opis tresci to porada, lista bledow, instrukcja albo cwiczenie - przekaz jej konkretna tresc (punkty, kroki), a nie tylko zapowiedz, ze porada istnieje.',
  'Gdy opis tresci jest bardzo krotki, pisz zwiezle i konkretnie zamiast wypelniac tekst ogolnikami.',
  'Jesli podano previousVersion, uzytkownik poprosil o NOWA wersje: napisz tekst wyraznie inny (inny hook, inna struktura i dobor slow), zachowujac te same fakty.',
  'hashtags: 3-6 trafnych slow kluczowych, bez spacji, bez znaku #.',
  'title: wypelnij TYLKO dla platformy YOUTUBE, max 80 znakow.',
  'cta: krotkie, opcjonalne wezwanie do dzialania dopasowane do platformy.',
  // 2026-09-16 (zgloszenie wlasciciela: wygenerowana tresc brzmiala zbyt generycznie-motywacyjnie,
  // "pizdowato" dla jego konta) - communicationStyle to NADRZĘDNA instrukcja co do tonu/slownictwa,
  // wazniejsza niz ogolne dopasowanie tonu do accountContext w linii wyzej, kiedy jest podana.
  'Jesli w danych podano communicationStyle (styl wypowiedzi wlasciciela konta) - to NADRZĘDNA instrukcja co do tonu i slownictwa, wazniejsza niz cokolwiek innego w tym prompcie. Trzymaj sie jej doslownie.',
  // 2026-09-25: wlasciciel konta definiuje wlasne zasady pisania per platforma (panel Konto) -
  // Postfly obsluguje rozne branze, wiec to on decyduje, jak ma wygladac jego post na LinkedIn.
  'Jesli w danych podano platformStyleGuides[PLATFORMA] - to NADRZĘDNE zasady pisania tekstu na te platforme (dlugosc, struktura, ton, emoji, hashtagi, CTA); maja pierwszenstwo przed ogolnymi konwencjami platform opisanymi wyzej. Nigdy nie zmyslaj faktow, liczb ani cech, ktorych nie ma w opisie tresci ani na obrazie.',
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

const DATA_URL = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/;

function usableImageUrls(input: OrchestrateContentInput) {
  return (input.imageUrls ?? [])
    .filter((url) => (/^https:\/\//i.test(url) && SUPPORTED_IMAGE_EXTENSIONS.test(url)) || DATA_URL.test(url))
    .slice(0, MAX_IMAGES);
}

// A public https URL is fetched by Anthropic; a data: URL (an image the API can't reach, e.g. on a
// private or local host) is sent inline as base64 (2026-10-03).
function imageBlock(url: string): AnthropicUserContentBlock {
  const inline = url.match(DATA_URL);
  if (inline) {
    return {
      type: 'image',
      source: { type: 'base64', media_type: inline[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: inline[2] },
    };
  }
  return { type: 'image', source: { type: 'url', url } };
}

export async function generateBundlesWithClaude(
  analysis: AnalysisOutput,
  input: OrchestrateContentInput,
  targetPlatforms: PlatformBundle['platform'][],
  businessDescription?: string | null,
  communicationStyle?: string | null,
  platformStyleGuides?: PlatformStyleGuides,
  brandHashtag?: string | null,
): Promise<PlatformBundle[] | null> {
  if (targetPlatforms.length === 0) {
    return null;
  }

  // Contact details are masked BEFORE anything leaves our servers and restored in the output -
  // one masker for the whole request, so token numbers are unique across fields.
  const masker = createContactMasker();
  const safeDescription = masker.mask((input.rawInput || '').trim());
  const safeAccountContext = masker.mask((businessDescription || '').trim());
  const safeCommunicationStyle = masker.mask((communicationStyle || '').trim());
  const safePreviousVersion = input.previousCaption ? masker.mask(input.previousCaption.trim()).slice(0, 2000) : '';

  // 2026-10-02 (AI review): persona/intent are no longer sent - they came from English-only
  // keyword heuristics and steered Polish posts the wrong way (any note mentioning "tiktok" made
  // the account a "video creator"). accountContext describes the business far better.
  const promptData = JSON.stringify({
    contentDescription: safeDescription || '(brak opisu od uzytkownika - napisz neutralny, chwytliwy tekst)',
    accountContext: safeAccountContext || '',
    communicationStyle: safeCommunicationStyle || '',
    platformStyleGuides: Object.fromEntries(
      targetPlatforms
        .filter((platform) => platformStyleGuides?.[platform])
        .map((platform) => [platform, masker.mask(platformStyleGuides![platform]!)]),
    ),
    contentType: analysis.contentType,
    platforms: targetPlatforms,
    ...(safePreviousVersion ? { previousVersion: safePreviousVersion } : {}),
  });

  const imageUrls = usableImageUrls(input);
  const request = (withImages: boolean) =>
    callClaudeTool<GeneratedBundlesToolResult>({
      scope: withImages ? 'smart-autopilot-content-vision' : 'smart-autopilot-content',
      model: CLAUDE_MODELS.contentGeneration,
      system: CONTENT_SYSTEM_PROMPT,
      userContent: withImages
        ? ([
            ...imageUrls.map(imageBlock),
            { type: 'text', text: promptData },
          ] satisfies AnthropicUserContentBlock[])
        : promptData,
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

  // An image the API can't fetch or decode fails the whole request - the text-only version is
  // still far better than the template fallback, so it gets one more try without the image.
  let result = await request(imageUrls.length > 0);
  if (!result && imageUrls.length > 0) {
    result = await request(false);
  }

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

    const tags = bundle.hashtags
      .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      .map((tag) => tag.trim().replace(/^#/, ''));
    // The account's brand tag always survives the cut (stored here without '#', like the rest).
    const brandTag = brandHashtag?.replace(/^#+/, '').trim();
    const finalTags = brandTag
      ? [...tags.filter((t) => t.toLowerCase() !== brandTag.toLowerCase()).slice(0, 7), brandTag]
      : tags.slice(0, 8);

    const title = bundle.title?.trim() ? masker.restore(bundle.title.trim()).slice(0, 100) : '';
    const cta = bundle.cta?.trim() ? masker.restore(bundle.cta.trim()).slice(0, 200) : '';

    ordered.push({
      platform,
      title: title || undefined,
      caption: masker.restore(bundle.caption.trim()).slice(0, PLATFORM_CAPTION_LIMIT[platform]),
      hashtags: finalTags,
      cta: cta || undefined,
    });
  }

  return ordered;
}
