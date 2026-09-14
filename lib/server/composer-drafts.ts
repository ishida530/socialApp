import { Platform } from '@prisma/client';
import { orchestrateContent } from './smart-autopilot/orchestrator';
import type { ScheduleSlot } from './smart-autopilot/types';

type PlatformBundle = {
  platform: 'TIKTOK' | 'INSTAGRAM' | 'YOUTUBE' | 'FACEBOOK';
  title?: string;
  caption: string;
  hashtags: string[];
};

export async function generatePlatformBundles(
  userId: string,
  options: {
    rawInput?: string;
    targetPlatforms: Platform[];
    timezone: string;
    idempotencyKey: string;
  },
) {
  try {
    const result = await orchestrateContent(userId, {
      mode: 'manual',
      publishMode: 'draft',
      rawInput: options.rawInput || undefined,
      targetPlatforms: options.targetPlatforms as PlatformBundle['platform'][],
      timezone: options.timezone,
      idempotencyKey: options.idempotencyKey,
    });

    return {
      bundlesByPlatform: new Map(result.platformBundles.map((bundle) => [bundle.platform, bundle])),
      orchestrationWarning: null as string | null,
      // EPIC 4 (obserwuj->planuj->działaj->sprawdź->popraw): orchestrateContent already computes
      // a real, reasoned schedule suggestion here - previously silently discarded by every
      // caller of generatePlatformBundles, so the "popraw" step never had a way to reach the
      // user. Passed through so callers (Telegram preview) can show it, not just apply it.
      schedule: result.schedule as ScheduleSlot[],
      // Autopilot (2026-09-14): the one signal that must survive the trip through this function -
      // orchestrateContent already forces draft/manual-review mode when a critical safety flag
      // fires (prompt-injection pattern, etc.), but that fact was previously discarded here too.
      // A caller deciding whether to skip the manual approval tap needs to know this explicitly.
      hasCriticalSafety: result.analysis?.safetyFlags.some((flag) => flag.severity === 'critical') ?? false,
    };
  } catch (error) {
    return {
      bundlesByPlatform: new Map<string, PlatformBundle>(),
      orchestrationWarning:
        error instanceof Error ? error.message : 'Nie udało się automatycznie wygenerować treści.',
      schedule: [] as ScheduleSlot[],
      hasCriticalSafety: false,
    };
  }
}
