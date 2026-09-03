import { Platform } from '@prisma/client';
import { orchestrateContent } from './smart-autopilot/orchestrator';

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
    };
  } catch (error) {
    return {
      bundlesByPlatform: new Map<string, PlatformBundle>(),
      orchestrationWarning:
        error instanceof Error ? error.message : 'Nie udało się automatycznie wygenerować treści.',
    };
  }
}
