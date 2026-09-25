// Per-platform writing rules defined by the account owner (User.platformStyleGuides) - see the
// schema comment. One place for validation (PATCH /api/auth/me) and for reading them back into
// generators, so every prompt treats them the same way.
import { Platform, type Prisma } from '@prisma/client';

export const STYLE_GUIDE_PLATFORMS = [
  Platform.FACEBOOK,
  Platform.INSTAGRAM,
  Platform.LINKEDIN,
  Platform.TIKTOK,
  Platform.YOUTUBE,
] as const;

export const STYLE_GUIDE_MAX_LENGTH = 3000;
export const BRAND_HASHTAG_MAX_LENGTH = 60;

export type PlatformStyleGuides = Partial<Record<Platform, string>>;

// Lenient read: whatever is stored (possibly written by an older version) comes back as a clean
// map of non-empty strings for known platforms only.
export function readPlatformStyleGuides(value: Prisma.JsonValue | null | undefined): PlatformStyleGuides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const guides: PlatformStyleGuides = {};
  for (const platform of STYLE_GUIDE_PLATFORMS) {
    const text = (value as Record<string, unknown>)[platform];
    if (typeof text === 'string' && text.trim()) {
      guides[platform] = text.trim();
    }
  }
  return guides;
}

// Strict parse for user input: returns validation errors instead of silently dropping fields.
export function parsePlatformStyleGuidesInput(
  input: unknown,
): { ok: true; value: PlatformStyleGuides } | { ok: false; errors: string[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['platformStyleGuides: wymagany obiekt { PLATFORMA: tekst }'] };
  }
  const errors: string[] = [];
  const value: PlatformStyleGuides = {};
  for (const [key, text] of Object.entries(input as Record<string, unknown>)) {
    if (!(STYLE_GUIDE_PLATFORMS as readonly string[]).includes(key)) {
      errors.push(`platformStyleGuides.${key}: nieznana platforma`);
      continue;
    }
    if (typeof text !== 'string') {
      errors.push(`platformStyleGuides.${key}: wymagany tekst`);
      continue;
    }
    if (text.trim().length > STYLE_GUIDE_MAX_LENGTH) {
      errors.push(`platformStyleGuides.${key}: maksymalnie ${STYLE_GUIDE_MAX_LENGTH} znaków`);
      continue;
    }
    if (text.trim()) {
      value[key as Platform] = text.trim();
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

export function normalizeBrandHashtag(input: string): string | null {
  const tag = input.trim().replace(/^#+/, '').replace(/\s+/g, '');
  return tag ? `#${tag}` : null;
}
