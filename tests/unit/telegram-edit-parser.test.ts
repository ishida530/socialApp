import { describe, expect, it } from 'vitest';
import { parseTelegramEditReply } from '@/lib/server/telegram-edit-parser';

describe('parseTelegramEditReply', () => {
  it('treats a plain single-line reply as caption only, leaving hashtags unchanged', () => {
    const result = parseTelegramEditReply('Nowy opis bez hashtagow', false);
    expect(result).toEqual({ title: undefined, caption: 'Nowy opis bez hashtagow', hashtags: undefined });
  });

  it('extracts trailing hashtags and strips them from the caption', () => {
    const result = parseTelegramEditReply('Nowy kawalek prosto z sesji #rap #newdrop', false);
    expect(result).toEqual({ title: undefined, caption: 'Nowy kawalek prosto z sesji', hashtags: ['rap', 'newdrop'] });
  });

  it('a hashtags-only reply updates only hashtags, leaving caption unchanged', () => {
    const result = parseTelegramEditReply('#chillhop #lofi', false);
    expect(result).toEqual({ title: undefined, caption: undefined, hashtags: ['chillhop', 'lofi'] });
  });

  it('for YouTube, a multi-line reply treats the first line as the title', () => {
    const result = parseTelegramEditReply('Nowy tytul odcinka\nOpis odcinka #shorts', true);
    expect(result).toEqual({ title: 'Nowy tytul odcinka', caption: 'Opis odcinka', hashtags: ['shorts'] });
  });

  it('for YouTube, a single-line reply does NOT touch the title, only the caption', () => {
    const result = parseTelegramEditReply('Tylko nowy opis', true);
    expect(result).toEqual({ title: undefined, caption: 'Tylko nowy opis', hashtags: undefined });
  });

  it('returns null for an empty or whitespace-only message', () => {
    expect(parseTelegramEditReply('', false)).toBeNull();
    expect(parseTelegramEditReply('   \n  ', false)).toBeNull();
  });
});
