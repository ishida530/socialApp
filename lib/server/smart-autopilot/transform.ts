import { redactPotentialPii } from './safety';
import type { AnalysisOutput, OrchestrateContentInput, PlatformBundle } from './types';

function asTitle(rawInput?: string) {
  const source = (rawInput || 'Nowy post').trim();
  return source.slice(0, 80);
}

function fallbackCaption(rawInput?: string) {
  return (rawInput || 'Nowa publikacja gotowa do harmonogramu.').trim().slice(0, 1800);
}

function creatorBundles(rawInput?: string): PlatformBundle[] {
  const base = redactPotentialPii(fallbackCaption(rawInput));
  return [
    {
      platform: 'TIKTOK',
      caption: `Hook w 1 sekundzie: ${base}`,
      hashtags: ['#fyp', '#creator', '#shortvideo'],
      cta: 'Zostaw komentarz i obserwuj po więcej.',
    },
    {
      platform: 'INSTAGRAM',
      caption: `Lifestyle cut: ${base}`,
      hashtags: ['#reels', '#contentcreator', '#behindthescenes'],
      cta: 'Link in bio po pełną wersję.',
    },
    {
      platform: 'YOUTUBE',
      title: asTitle(rawInput),
      caption: `Shorts briefing: ${base}`,
      hashtags: ['#shorts', '#youtubecreator'],
      cta: 'Subskrybuj kanał po kolejne materiały.',
    },
  ];
}

function ecommerceBundles(rawInput?: string): PlatformBundle[] {
  const base = redactPotentialPii(fallbackCaption(rawInput));
  return [
    {
      platform: 'FACEBOOK',
      caption: `Oferta dnia: ${base}`,
      hashtags: ['#shopnow', '#promo', '#sale'],
      cta: 'Sprawdź szczegóły i zamów teraz.',
    },
    {
      platform: 'INSTAGRAM',
      caption: `${base}\nLink in Bio po pełną ofertę.`,
      hashtags: ['#ecommerce', '#newdrop', '#linkinbio'],
      cta: 'Kliknij Link in Bio.',
    },
    {
      platform: 'YOUTUBE',
      title: asTitle(rawInput),
      caption: `Szybki test produktu: ${base}`,
      hashtags: ['#shorts', '#unboxing', '#gadgets'],
      cta: 'Sprawdź link i zamów online.',
    },
    {
      platform: 'TIKTOK',
      caption: `3 powody, dla których warto: ${base}`,
      hashtags: ['#tiktokmademebuyit', '#ecommerce', '#musthave'],
      cta: 'Kliknij i sprawdź ofertę.',
    },
  ];
}

function realEstateBundles(rawInput?: string): PlatformBundle[] {
  const base = redactPotentialPii(fallbackCaption(rawInput));
  return [
    {
      platform: 'FACEBOOK',
      caption: `Szczegóły nieruchomości: ${base}`,
      hashtags: ['#realestate', '#property', '#listing'],
      cta: 'Napisz, aby umówić viewing.',
    },
    {
      platform: 'INSTAGRAM',
      caption: `Tour: ${base}\n[Location] • [Key Features] • [sqm/rooms/price]`,
      hashtags: ['#propertytour', '#realestateagent', '#newlisting'],
      cta: 'Zarezerwuj oglądanie.',
    },
    {
      platform: 'TIKTOK',
      caption: `Property tour z szybkim hookiem: ${base}`,
      hashtags: ['#hometour', '#realestate', '#propertytok'],
      cta: 'Sprawdź dostępne terminy oglądania.',
    },
    {
      platform: 'YOUTUBE',
      title: asTitle(rawInput),
      caption: `Profesjonalny walkthrough: ${base}`,
      hashtags: ['#realestate', '#hometour', '#shorts'],
      cta: 'Skontaktuj się w sprawie oferty.',
    },
  ];
}

function neutralBundles(rawInput?: string): PlatformBundle[] {
  const base = redactPotentialPii(fallbackCaption(rawInput));
  return [
    {
      platform: 'FACEBOOK',
      caption: base,
      hashtags: ['#update'],
    },
    {
      platform: 'INSTAGRAM',
      caption: base,
      hashtags: ['#post'],
    },
    {
      platform: 'YOUTUBE',
      title: asTitle(rawInput),
      caption: `Shorts update: ${base}`,
      hashtags: ['#shorts', '#update'],
      cta: 'Subskrybuj po kolejne materiały.',
    },
    {
      platform: 'TIKTOK',
      caption: `Krótka aktualizacja: ${base}`,
      hashtags: ['#tiktok', '#update'],
      cta: 'Zostaw komentarz i obserwuj profil.',
    },
  ];
}

export function transformByPersona(
  analysis: AnalysisOutput,
  input: OrchestrateContentInput,
): PlatformBundle[] {
  if (analysis.persona === 'video_creator') {
    return creatorBundles(input.rawInput);
  }

  if (analysis.persona === 'ecommerce_owner') {
    return ecommerceBundles(input.rawInput);
  }

  if (analysis.persona === 'real_estate_agent') {
    return realEstateBundles(input.rawInput);
  }

  return neutralBundles(input.rawInput);
}
