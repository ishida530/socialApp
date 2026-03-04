import type {
  AnalysisOutput,
  OrchestrateContentInput,
  PlatformBundle,
  ScheduleSlot,
} from './types';

const BASELINE_HOURS: Record<AnalysisOutput['persona'], number[]> = {
  ecommerce_owner: [12, 13, 19, 20],
  real_estate_agent: [8, 9, 10, 11],
  video_creator: [17, 18, 20, 21],
  neutral: [12, 18],
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function weightedScore(row: {
  ctr?: number;
  er?: number;
  watchTime?: number;
  saves?: number;
}) {
  const ctr = row.ctr ?? 0;
  const er = row.er ?? 0;
  const watchTime = row.watchTime ?? 0;
  const saves = row.saves ?? 0;

  return ctr * 0.35 + er * 0.3 + watchTime * 0.2 + saves * 0.15;
}

function mapPreferredHourByPlatform(input: OrchestrateContentInput) {
  const map = new Map<string, number>();

  input.performanceData?.forEach((row) => {
    const score = weightedScore(row);
    const key = row.platform;

    const existingHour = map.get(key);
    if (existingHour === undefined) {
      map.set(key, row.hour);
      return;
    }

    const existingScore = weightedScore(
      input.performanceData?.find((r) => r.platform === key && r.hour === existingHour) || {},
    );

    if (score > existingScore) {
      map.set(key, row.hour);
    }
  });

  return map;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const localized = new Date(date.toLocaleString('en-US', { timeZone }));
  return date.getTime() - localized.getTime();
}

function toUtcFromTimeZone(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() + offsetMs);
}

function nextLocalDateAtHour(timeZone: string, hour: number, dayOffset: number) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '1970');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '1');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '1');

  const base = toUtcFromTimeZone(timeZone, year, month, day, hour);
  base.setUTCDate(base.getUTCDate() + dayOffset);

  if (base.getTime() <= Date.now()) {
    base.setUTCDate(base.getUTCDate() + 1);
  }

  return base;
}

export function optimizeSchedule(
  analysis: AnalysisOutput,
  bundles: PlatformBundle[],
  input: OrchestrateContentInput,
): ScheduleSlot[] {
  const baselineHours = BASELINE_HOURS[analysis.persona] || BASELINE_HOURS.neutral;
  const historyPreferredHour = mapPreferredHourByPlatform(input);

  const usedTimes = new Set<number>();
  const slots: ScheduleSlot[] = [];

  bundles.forEach((bundle, index) => {
    const baselineHour = baselineHours[index % baselineHours.length];
    const candidateHistoryHour = historyPreferredHour.get(bundle.platform);

    const shiftedHour =
      candidateHistoryHour === undefined
        ? baselineHour
        : clamp(candidateHistoryHour, baselineHour - 2, baselineHour + 2);

    let slotDate = nextLocalDateAtHour(input.timezone, shiftedHour, Math.floor(index / 2));

    while (usedTimes.has(slotDate.getTime())) {
      slotDate = new Date(slotDate.getTime() + 60 * 60 * 1000);
    }

    usedTimes.add(slotDate.getTime());

    const historyBoost = candidateHistoryHour === undefined ? 0 : 0.12;
    const score = clamp(0.7 + historyBoost - Math.abs(shiftedHour - baselineHour) * 0.03, 0.1, 0.98);

    slots.push({
      platform: bundle.platform,
      scheduledFor: slotDate.toISOString(),
      timezone: input.timezone,
      score,
      reason:
        candidateHistoryHour === undefined
          ? 'Baseline persona slot (brak danych historycznych).'
          : 'Baseline + korekta historyczna z ograniczeniem odchylenia.',
    });
  });

  return slots;
}
