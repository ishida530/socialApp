// Publication formats for Facebook/Instagram (2026-10-10) - the single source of truth shared by
// the web composer (MetaFormatPanel), the Telegram preview (format button and description), the
// draft PATCH validation and the sticky default when a draft is created. Before this, each of them
// kept its own copy of the rules and they drifted apart: Instagram still offered "Zwykły post" for
// videos after Meta retired media_type=VIDEO (error_subcode 2207067).
//
// - Photos and text posts: no format choice on any platform.
// - Facebook video: Reels, a plain video post, or both (two separate publications).
// - Instagram video: always a Reel (published with share_to_feed, so it also lands in the profile
//   grid and followers' feed) - nothing to choose.

export type MetaPostFormat = 'REELS' | 'FEED' | 'BOTH';

export const META_POST_FORMATS: readonly MetaPostFormat[] = ['REELS', 'FEED', 'BOTH'];

export const DEFAULT_META_POST_FORMAT: MetaPostFormat = 'REELS';

export function isMetaPostFormat(value: unknown): value is MetaPostFormat {
  return typeof value === 'string' && (META_POST_FORMATS as readonly string[]).includes(value);
}

// Formats available for this platform and material, in the order the UI shows (and Telegram cycles) them.
export function metaPostFormatOptions(platform: string, mediaType: string): MetaPostFormat[] {
  if (mediaType !== 'VIDEO') {
    return [];
  }
  if (platform === 'FACEBOOK') {
    return ['REELS', 'FEED', 'BOTH'];
  }
  if (platform === 'INSTAGRAM') {
    return ['REELS'];
  }
  return [];
}

// True only when the user has a real choice to make (more than one option).
export function canChooseMetaPostFormat(platform: string, mediaType: string): boolean {
  return metaPostFormatOptions(platform, mediaType).length > 1;
}

// The format that will actually be used: the stored value when it's still allowed, otherwise the
// default. null when formats don't apply (photo, text, non-Meta platform).
export function effectiveMetaPostFormat(
  platform: string,
  mediaType: string,
  stored: string | null | undefined,
): MetaPostFormat | null {
  const options = metaPostFormatOptions(platform, mediaType);
  if (options.length === 0) {
    return null;
  }
  return isMetaPostFormat(stored) && options.includes(stored) ? stored : DEFAULT_META_POST_FORMAT;
}

// Next format in the cycle (Telegram's single format button). Stays put when there's nothing to choose.
export function nextMetaPostFormat(
  platform: string,
  mediaType: string,
  current: string | null | undefined,
): MetaPostFormat | null {
  const options = metaPostFormatOptions(platform, mediaType);
  const effective = effectiveMetaPostFormat(platform, mediaType, current);
  if (!effective) {
    return null;
  }
  return options[(options.indexOf(effective) + 1) % options.length];
}

export const META_POST_FORMAT_LABEL: Record<MetaPostFormat, string> = {
  REELS: 'Reels',
  FEED: 'zwykły post',
  BOTH: 'Reels + zwykły post (2 osobne publikacje)',
};

// Short labels for Telegram's inline button.
export const META_POST_FORMAT_BUTTON: Record<MetaPostFormat, string> = {
  REELS: '🎬 Reels',
  FEED: '📋 Zwykły post',
  BOTH: '🎬📋 Oba',
};
