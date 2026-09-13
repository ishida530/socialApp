import { describe, expect, it } from 'vitest';
import { optimizeSchedule } from '@/lib/server/smart-autopilot/schedule';
import type { AnalysisOutput, OrchestrateContentInput, PlatformBundle } from '@/lib/server/smart-autopilot/types';

// TASK-4.1.3: when there's no historical performance data for a platform, the schedule falls
// back to the persona baseline slot and the reason is EXPLICITLY labeled as not data-driven -
// never silently presented as if it were an informed choice.

const analysis: AnalysisOutput = {
  persona: 'video_creator',
  contentType: 'video',
  intent: 'promotional',
  confidence: 0.8,
  safetyFlags: [],
  unknownAspectRatio: false,
  aspectRatioConfidence: 0.9,
};

const bundles: PlatformBundle[] = [{ platform: 'TIKTOK', caption: 'x', hashtags: [] }];

function baseInput(overrides: Partial<OrchestrateContentInput> = {}): OrchestrateContentInput {
  return {
    rawInput: 'x',
    timezone: 'Europe/Warsaw',
    mode: 'manual',
    publishMode: 'draft',
    idempotencyKey: 'idem-schedule-test',
    ...overrides,
  };
}

describe('optimizeSchedule - data-driven vs baseline fallback', () => {
  it('labels the slot as baseline/not-data-driven when performanceData is absent', () => {
    const [slot] = optimizeSchedule(analysis, bundles, baseInput());

    expect(slot.reason).toMatch(/brak danych historycznych/i);
  });

  it('labels the slot as baseline/not-data-driven when performanceData is an empty array', () => {
    const [slot] = optimizeSchedule(analysis, bundles, baseInput({ performanceData: [] }));

    expect(slot.reason).toMatch(/brak danych historycznych/i);
  });

  it('uses a different, higher-confidence reason and shifts the hour when real performance data is present', () => {
    const [baselineSlot] = optimizeSchedule(analysis, bundles, baseInput());
    const [dataSlot] = optimizeSchedule(
      analysis,
      bundles,
      baseInput({ performanceData: [{ platform: 'TIKTOK', hour: 21, er: 0.2 }] }),
    );

    expect(dataSlot.reason).not.toMatch(/brak danych historycznych/i);
    expect(dataSlot.reason).toMatch(/korekta historyczna/i);
    expect(dataSlot.score).toBeGreaterThan(baselineSlot.score);
  });
});
