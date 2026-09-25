// Prompt building for external-content announcements (2026-09-25). Postfly stays brand-neutral:
// only the rules that hold for ANY caller live here (no invented facts, platform link mechanics,
// hashtag limits). Everything brand-specific - who the business is, its tone, a per-platform style
// guide, its brand hashtag - is sent by the caller in the intake payload, so each in-house site
// (starting with Pryzmat Nieruchomosci) owns its own voice. Whatever the model must not get wrong
// is also enforced in code by applyPlatformRules/findUnsupportedNumbers in external-content.ts.
import { Platform } from '@prisma/client';
import type { ExternalContentKind, ExternalContentPayload } from './external-content';

export type UrlMode = 'last-line' | 'none';

export type PlatformMechanics = {
  maxHashtags: number;
  // Facebook/LinkedIn render a clickable URL in the post text; on Instagram it's dead text, so
  // the caption must point to the link in bio instead.
  urlMode: UrlMode;
  hint: string;
};

// Platform facts, not style: Instagram hard-caps hashtags at 5 (Dec 2025); on FB/LinkedIn more
// than ~3 only adds noise.
const MECHANICS: Partial<Record<Platform, PlatformMechanics>> = {
  [Platform.FACEBOOK]: {
    maxHashtags: 3,
    urlMode: 'last-line',
    hint: 'Link jest klikalny: umieść pełny URL w ostatniej linii treści z krótkim kontekstem.',
  },
  [Platform.INSTAGRAM]: {
    maxHashtags: 5,
    urlMode: 'none',
    hint: 'Link w opisie NIE jest klikalny: nie wklejaj URL, odeślij do linku w bio.',
  },
  [Platform.LINKEDIN]: {
    maxHashtags: 3,
    urlMode: 'last-line',
    hint: 'Najważniejsza wiedza w treści posta; pełny URL tylko w ostatniej linii.',
  },
};

const COMMON_RULES = [
  'Piszesz GOTOWY do publikacji post po polsku, nie pomysł.',
  'Używaj WYŁĄCZNIE faktów z danych wejściowych. Nie dopisuj parametrów, cech, odległości, stawek, kwot ani statystyk, których nie ma w danych. Jedyne dozwolone wyliczenie: cena za m² (cena / metraż, zaokrąglona do pełnych złotych), jeśli oba są w danych.',
  'Post ma dawać czytelnikowi realną wartość i konkretny powód, żeby wejść na stronę. Zero clickbaitu, CAPS LOCK, wielokrotnych wykrzykników, ciągów emoji, obietnic rezultatu i engagement baitu.',
  'Zacznij od konkretu i zmieść hook w pierwszych 120 znakach.',
  'Nie przepisuj opisu 1:1 - wybierz najważniejsze informacje i przeredaguj.',
  'Hashtagi zwracasz OSOBNO w polu hashtags, nie w treści.',
].join('\n- ');

export function getPlatformMechanics(platform: Platform): PlatformMechanics | null {
  return MECHANICS[platform] ?? null;
}

export function buildAnnouncementSystemPrompt(
  kind: ExternalContentKind,
  platform: Platform,
  payload: Pick<ExternalContentPayload, 'brandContext' | 'platformGuides' | 'siteLabel'>,
): string {
  const mechanics = getPlatformMechanics(platform);
  const what =
    kind === 'BLOG_POST'
      ? `post na ${platform} zapowiadający nowy artykuł z bloga/poradnika firmy`
      : `post na ${platform} ogłaszający nową ofertę firmy (np. nieruchomość, produkt, usługa, realizacja)`;
  const guide = payload.platformGuides?.[platform];

  return [
    `Twoje zadanie: ${what}.`,
    payload.brandContext ? `O firmie (trzymaj się jej usług, regionu i tonu):\n${payload.brandContext}` : '',
    `Zasady ogólne:\n- ${COMMON_RULES}`,
    mechanics
      ? `Mechanika platformy: ${mechanics.hint}${mechanics.urlMode === 'none' && payload.siteLabel ? ` Nazwa strony do podania: ${payload.siteLabel}.` : ''} Maksymalnie ${mechanics.maxHashtags} hashtagów.`
      : '',
    guide ? `Przewodnik stylu firmy dla tej platformy (stosuj go):\n${guide}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
