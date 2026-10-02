import type { AnalysisOutput, OrchestrateContentInput, PlatformBundle } from './types';

// Fallback when the AI is unavailable (no API key, provider error, timeout, malformed response).
//
// 2026-10-02 (AI review): the old persona templates prefixed the user's note with copywriting
// instructions that ended up verbatim in real posts - "Hook w 1 sekundzie: ...", "Lifestyle cut:
// ...", "Krótka aktualizacja: ..." - and stacked on every "Generuj ponownie". The fallback now
// keeps the user's own words untouched (the composer tells them the AI was unavailable, so they
// know to polish it) and only adds hashtags typical for the platform and kind of account. Nothing
// here leaves our servers, so the text is not redacted either - it's the user's own post.

const ALL_PLATFORMS: PlatformBundle['platform'][] = ['TIKTOK', 'INSTAGRAM', 'YOUTUBE', 'FACEBOOK', 'LINKEDIN'];

const HASHTAGS_BY_PERSONA: Record<AnalysisOutput['persona'], Partial<Record<PlatformBundle['platform'], string[]>>> = {
  video_creator: {
    TIKTOK: ['fyp', 'creator'],
    INSTAGRAM: ['reels', 'contentcreator'],
    YOUTUBE: ['shorts'],
  },
  ecommerce_owner: {
    TIKTOK: ['tiktokmademebuyit'],
    INSTAGRAM: ['nowosc', 'sklep'],
    FACEBOOK: ['promocja'],
    YOUTUBE: ['shorts'],
  },
  real_estate_agent: {
    INSTAGRAM: ['nieruchomosci', 'mieszkanie'],
    FACEBOOK: ['nieruchomosci'],
    TIKTOK: ['nieruchomosci'],
    YOUTUBE: ['shorts'],
    LINKEDIN: ['nieruchomosci'],
  },
  neutral: {
    YOUTUBE: ['shorts'],
  },
};

function noteOf(rawInput?: string) {
  return (rawInput || '').trim().slice(0, 1800);
}

export function transformByPersona(analysis: AnalysisOutput, input: OrchestrateContentInput): PlatformBundle[] {
  const note = noteOf(input.rawInput);
  const hashtags = HASHTAGS_BY_PERSONA[analysis.persona] ?? HASHTAGS_BY_PERSONA.neutral;

  return ALL_PLATFORMS.map((platform) => ({
    platform,
    ...(platform === 'YOUTUBE' ? { title: (note || 'Nowy film').slice(0, 80) } : {}),
    caption: note,
    hashtags: hashtags[platform] ?? [],
  }));
}
