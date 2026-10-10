import { describe, expect, it } from 'vitest';
import {
  canChooseMetaPostFormat,
  effectiveMetaPostFormat,
  metaPostFormatOptions,
  nextMetaPostFormat,
} from '@/lib/meta-post-format';

// Single source of truth for publication formats (2026-10-10), shared by the web composer,
// Telegram and the draft API - see lib/meta-post-format.ts.
describe('meta post formats', () => {
  it('offers no format for photos, text posts and non-Meta platforms', () => {
    expect(metaPostFormatOptions('FACEBOOK', 'IMAGE')).toEqual([]);
    expect(metaPostFormatOptions('INSTAGRAM', 'IMAGE')).toEqual([]);
    expect(metaPostFormatOptions('FACEBOOK', 'TEXT')).toEqual([]);
    expect(metaPostFormatOptions('TIKTOK', 'VIDEO')).toEqual([]);
    expect(effectiveMetaPostFormat('INSTAGRAM', 'IMAGE', 'FEED')).toBeNull();
  });

  it('Facebook video: Reels, plain post or both - a real choice', () => {
    expect(metaPostFormatOptions('FACEBOOK', 'VIDEO')).toEqual(['REELS', 'FEED', 'BOTH']);
    expect(canChooseMetaPostFormat('FACEBOOK', 'VIDEO')).toBe(true);
    expect(nextMetaPostFormat('FACEBOOK', 'VIDEO', 'REELS')).toBe('FEED');
    expect(nextMetaPostFormat('FACEBOOK', 'VIDEO', 'FEED')).toBe('BOTH');
    expect(nextMetaPostFormat('FACEBOOK', 'VIDEO', 'BOTH')).toBe('REELS');
    expect(nextMetaPostFormat('FACEBOOK', 'VIDEO', null)).toBe('FEED');
  });

  it('Instagram video: always Reels, nothing to choose, old FEED/BOTH values fall back to REELS', () => {
    expect(metaPostFormatOptions('INSTAGRAM', 'VIDEO')).toEqual(['REELS']);
    expect(canChooseMetaPostFormat('INSTAGRAM', 'VIDEO')).toBe(false);
    expect(effectiveMetaPostFormat('INSTAGRAM', 'VIDEO', 'FEED')).toBe('REELS');
    expect(effectiveMetaPostFormat('INSTAGRAM', 'VIDEO', 'BOTH')).toBe('REELS');
    expect(nextMetaPostFormat('INSTAGRAM', 'VIDEO', 'REELS')).toBe('REELS');
  });

  it('defaults to REELS when nothing (or garbage) is stored', () => {
    expect(effectiveMetaPostFormat('FACEBOOK', 'VIDEO', null)).toBe('REELS');
    expect(effectiveMetaPostFormat('FACEBOOK', 'VIDEO', 'STORY')).toBe('REELS');
  });
});
