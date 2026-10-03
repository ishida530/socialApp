import { Platform } from '@prisma/client';
import { orchestrateContent } from './smart-autopilot/orchestrator';
import type { ScheduleSlot } from './smart-autopilot/types';
import { aiQuotaDeniedMessage, hasAiGenerationQuota, recordAiGeneration } from './subscription';
import { logError } from './observability';

type PlatformBundle = {
  platform: 'TIKTOK' | 'INSTAGRAM' | 'YOUTUBE' | 'FACEBOOK' | 'LINKEDIN';
  title?: string;
  caption: string;
  hashtags: string[];
};

// What the AI gets to look at (2026-10-02): the photo itself, or the video's thumbnail when one
// exists. Video files themselves aren't sent - the Messages API takes images, not video.
export function previewImageUrls(video: { mediaType: string; sourceUrl: string | null; thumbnailUrl: string | null }) {
  const url = video.mediaType === 'IMAGE' ? video.sourceUrl : video.thumbnailUrl;
  return url ? [url] : [];
}

export async function generatePlatformBundles(
  userId: string,
  options: {
    rawInput?: string;
    targetPlatforms: Platform[];
    timezone: string;
    idempotencyKey: string;
    imageUrls?: string[];
    previousCaption?: string;
  },
) {
  try {
    const quotaOk = await hasAiGenerationQuota(userId);
    const result = await orchestrateContent(userId, {
      mode: 'manual',
      publishMode: 'draft',
      rawInput: options.rawInput || undefined,
      targetPlatforms: options.targetPlatforms as PlatformBundle['platform'][],
      timezone: options.timezone,
      idempotencyKey: options.idempotencyKey,
      ...(options.imageUrls?.length ? { imageUrls: options.imageUrls } : {}),
      ...(options.previousCaption ? { previousCaption: options.previousCaption } : {}),
      ...(quotaOk ? {} : { skipAi: true }),
    });

    const aiGenerated = result.aiCopy === true;
    if (aiGenerated) {
      await recordAiGeneration(userId);
    }

    return {
      bundlesByPlatform: new Map(result.platformBundles.map((bundle) => [bundle.platform, bundle])),
      orchestrationWarning: (quotaOk ? null : await aiQuotaDeniedMessage(userId)) as string | null,
      // false = the AI didn't write the copy (provider unavailable or quota used up) and the
      // captions are the user's own note.
      aiGenerated,
      aiUnavailableReason: (aiGenerated ? null : quotaOk ? 'provider' : 'quota') as 'provider' | 'quota' | null,
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
    // Internal orchestration errors (duplicate payload, idempotency, validation) are logged, not
    // shown - the composer toasts orchestrationWarning to the user as-is (2026-10-03).
    logError('composer-drafts', 'generate-bundles-failed', error, { userId });
    return {
      bundlesByPlatform: new Map<string, PlatformBundle>(),
      orchestrationWarning: 'Nie udało się przygotować opisu automatycznie - uzupełnij go ręcznie albo spróbuj ponownie.',
      aiGenerated: false,
      aiUnavailableReason: 'provider' as 'provider' | 'quota' | null,
      schedule: [] as ScheduleSlot[],
      hasCriticalSafety: false,
    };
  }
}
