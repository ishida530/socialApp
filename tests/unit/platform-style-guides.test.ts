import { describe, expect, it } from 'vitest';
import {
  normalizeBrandHashtag,
  parsePlatformStyleGuidesInput,
  readPlatformStyleGuides,
  STYLE_GUIDE_MAX_LENGTH,
} from '@/lib/server/platform-style-guides';

describe('parsePlatformStyleGuidesInput', () => {
  it('keeps trimmed guides for known platforms and drops empty ones', () => {
    expect(parsePlatformStyleGuidesInput({ FACEBOOK: '  krótko  ', LINKEDIN: '   ' })).toEqual({
      ok: true,
      value: { FACEBOOK: 'krótko' },
    });
  });

  it('rejects unknown platforms, non-strings and over-long guides', () => {
    const result = parsePlatformStyleGuidesInput({
      MYSPACE: 'x',
      FACEBOOK: 5,
      INSTAGRAM: 'a'.repeat(STYLE_GUIDE_MAX_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(3);
  });

  it('rejects a non-object', () => {
    expect(parsePlatformStyleGuidesInput('FACEBOOK').ok).toBe(false);
  });
});

describe('readPlatformStyleGuides', () => {
  it('ignores garbage stored by older versions', () => {
    expect(readPlatformStyleGuides({ FACEBOOK: 'ok', X: 'no', LINKEDIN: 3 })).toEqual({ FACEBOOK: 'ok' });
    expect(readPlatformStyleGuides(null)).toEqual({});
    expect(readPlatformStyleGuides(['FACEBOOK'])).toEqual({});
  });
});

describe('normalizeBrandHashtag', () => {
  it('normalizes to a single leading # without spaces, or null when empty', () => {
    expect(normalizeBrandHashtag('  ##firma oze ')).toBe('#firmaoze');
    expect(normalizeBrandHashtag('  ')).toBeNull();
  });
});
