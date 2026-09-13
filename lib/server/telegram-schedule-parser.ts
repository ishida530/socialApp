// Parses a free-text Telegram reply into a future publish date/time, started by the "📅
// Zaplanuj" button (see the `schedulestart` callback in the webhook). Accepts the formats a
// Polish-speaking user would naturally type - no rigid ISO syntax to learn:
//   "za 5 minut" / "za 2 godziny"           - relative offset from now
//   "dziś 20:00" / "jutro 19:00"            - relative day + time
//   "15.09.2026 19:00" / "15.09 19:00"      - explicit date + time (year optional, day/month
//                                              with "." or "/", time with ":" or ".")
//
// All absolute times are interpreted in Europe/Warsaw local time (this app's fixed default
// timezone elsewhere - orchestrateContent, smart-autopilot/schedule.ts - there is no per-user
// timezone setting to read instead). Returns null for anything unparseable OR resolving to a
// moment that isn't actually in the future - the caller re-prompts rather than silently
// scheduling something nonsensical.

const TIMEZONE = 'Europe/Warsaw';

// Deliberately avoids `new Date(someLocaleString)` - re-parsing a formatted string depends on
// the SYSTEM's own default timezone, not just the target one, so that trick silently breaks on
// any machine whose local tz isn't UTC (this app's Vercel deployment happens to run as UTC,
// masking the bug there, but it must not leak into a new implementation). formatToParts instead
// reads the wall-clock fields directly, with no dependency on the runtime's own timezone.
function getWarsawOffsetMs(utcInstant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(utcInstant);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const hour = get('hour') % 24; // some engines format midnight as "24" with hour12: false

  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asUtc - utcInstant.getTime();
}

function toUtcFromWarsaw(year: number, month: number, day: number, hour: number, minute: number) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const offsetMs = getWarsawOffsetMs(utcGuess);
  return new Date(utcGuess.getTime() - offsetMs);
}

function warsawDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value ?? '1970'),
    month: Number(parts.find((part) => part.type === 'month')?.value ?? '1'),
    day: Number(parts.find((part) => part.type === 'day')?.value ?? '1'),
  };
}

export function parseTelegramScheduleReply(rawText: string, now: Date = new Date()): Date | null {
  const text = rawText.trim().toLowerCase();
  let result: Date | null = null;

  const relativeOffsetMatch = text.match(/^za\s+(\d+)\s*(\S+)$/);
  if (relativeOffsetMatch) {
    const amount = Number(relativeOffsetMatch[1]);
    const unitWord = relativeOffsetMatch[2];
    if (unitWord.startsWith('min')) {
      result = new Date(now.getTime() + amount * 60 * 1000);
    } else if (unitWord.startsWith('godz') || unitWord === 'h') {
      result = new Date(now.getTime() + amount * 60 * 60 * 1000);
    }
  }

  if (!result) {
    const relativeDayMatch = text.match(/^(dziś|dzisiaj|jutro)\s+(\d{1,2})[:.](\d{2})$/);
    if (relativeDayMatch) {
      const hour = Number(relativeDayMatch[2]);
      const minute = Number(relativeDayMatch[3]);
      if (hour <= 23 && minute <= 59) {
        const dayOffset = relativeDayMatch[1] === 'jutro' ? 1 : 0;
        const parts = warsawDateParts(now);
        result = toUtcFromWarsaw(parts.year, parts.month, parts.day + dayOffset, hour, minute);
      }
    }
  }

  if (!result) {
    const fullDateMatch = text.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\s+(\d{1,2})[:.](\d{2})$/);
    if (fullDateMatch) {
      const day = Number(fullDateMatch[1]);
      const month = Number(fullDateMatch[2]);
      const hour = Number(fullDateMatch[4]);
      const minute = Number(fullDateMatch[5]);

      if (month <= 12 && day <= 31 && hour <= 23 && minute <= 59) {
        const currentYear = warsawDateParts(now).year;
        const year = fullDateMatch[3] ? Number(fullDateMatch[3]) : currentYear;
        let candidate = toUtcFromWarsaw(year, month, day, hour, minute);

        // No year typed and that date already passed this year - assume the user means next
        // year's occurrence, not a moment in the past.
        if (!fullDateMatch[3] && candidate.getTime() <= now.getTime()) {
          candidate = toUtcFromWarsaw(year + 1, month, day, hour, minute);
        }

        result = candidate;
      }
    }
  }

  if (!result || Number.isNaN(result.getTime()) || result.getTime() <= now.getTime()) {
    return null;
  }

  return result;
}
