import { describe, expect, it } from 'vitest';
import { parseTelegramScheduleReply } from '@/lib/server/telegram-schedule-parser';

// A fixed "now" mid-year so Europe/Warsaw is in DST (UTC+2) - exercises the offset math, not
// just the parsing regexes.
const NOW = new Date('2026-06-15T10:00:00.000Z'); // 12:00 Warsaw time

describe('parseTelegramScheduleReply', () => {
  it('parses "za N minut" as a relative offset from now', () => {
    const result = parseTelegramScheduleReply('za 5 minut', NOW);
    expect(result).toEqual(new Date(NOW.getTime() + 5 * 60 * 1000));
  });

  it('parses "za N godzin"/"za N godziny" as a relative offset from now', () => {
    expect(parseTelegramScheduleReply('za 2 godziny', NOW)).toEqual(new Date(NOW.getTime() + 2 * 60 * 60 * 1000));
    expect(parseTelegramScheduleReply('za 1 godzinę', NOW)).toEqual(new Date(NOW.getTime() + 1 * 60 * 60 * 1000));
  });

  it('parses "dziś HH:MM" as today at that Warsaw local time', () => {
    // NOW is 12:00 Warsaw - "dziś 20:00" should resolve to 18:00 UTC same day (UTC+2 DST).
    const result = parseTelegramScheduleReply('dziś 20:00', NOW);
    expect(result?.toISOString()).toBe('2026-06-15T18:00:00.000Z');
  });

  it('parses "jutro HH:MM" as tomorrow at that Warsaw local time', () => {
    const result = parseTelegramScheduleReply('jutro 09:30', NOW);
    expect(result?.toISOString()).toBe('2026-06-16T07:30:00.000Z');
  });

  it('parses an explicit "DD.MM.YYYY HH:MM" date', () => {
    const result = parseTelegramScheduleReply('20.09.2026 19:00', NOW);
    // September is outside DST-ambiguous territory relative to NOW but still UTC+2 in Poland.
    expect(result?.toISOString()).toBe('2026-09-20T17:00:00.000Z');
  });

  it('parses "DD.MM HH:MM" without a year, assuming the current year when still in the future', () => {
    const result = parseTelegramScheduleReply('20.09 19:00', NOW);
    expect(result?.toISOString()).toBe('2026-09-20T17:00:00.000Z');
  });

  it('rolls over to next year when the yearless date has already passed this year', () => {
    const result = parseTelegramScheduleReply('01.01 10:00', NOW);
    expect(result?.getUTCFullYear()).toBe(2027);
  });

  it('accepts "/" as a date separator and "." as a time separator', () => {
    const result = parseTelegramScheduleReply('20/09/2026 19.00', NOW);
    expect(result?.toISOString()).toBe('2026-09-20T17:00:00.000Z');
  });

  it('returns null for a date/time that has already passed', () => {
    expect(parseTelegramScheduleReply('01.01.2020 10:00', NOW)).toBeNull();
    expect(parseTelegramScheduleReply('dziś 08:00', NOW)).toBeNull();
  });

  it('returns null for unparseable text', () => {
    expect(parseTelegramScheduleReply('kiedyś wieczorem', NOW)).toBeNull();
    expect(parseTelegramScheduleReply('', NOW)).toBeNull();
    expect(parseTelegramScheduleReply('za dużo hałasu', NOW)).toBeNull();
  });

  it('returns null for an out-of-range hour/minute/month/day', () => {
    expect(parseTelegramScheduleReply('jutro 25:00', NOW)).toBeNull();
    expect(parseTelegramScheduleReply('32.13.2026 19:00', NOW)).toBeNull();
  });
});
