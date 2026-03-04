import { createHash, randomUUID } from 'crypto';
import { prisma } from '@/lib/server/prisma';
import { logError, logEvent } from '@/lib/server/observability';
import { analyzeInput } from './analysis';
import { optimizeSchedule } from './schedule';
import { buildStrategySummary } from './strategy';
import { transformByPersona } from './transform';
import {
  OrchestrationBusinessError,
  type OrchestrateContentInput,
  type OrchestrateContentOutput,
  type SubscriptionTier,
} from './types';
import { validateOrchestrateContentOutput } from './validation';

type CachedIdempotency = {
  payloadHash: string;
  response: OrchestrateContentOutput;
  createdAt: number;
};

const IDEMPOTENCY_TTL_MS = 30 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

const globalForOrchestrator = globalThis as unknown as {
  idempotencyMap?: Map<string, CachedIdempotency>;
  payloadDedupMap?: Map<string, number>;
};

function getIdempotencyMap() {
  if (!globalForOrchestrator.idempotencyMap) {
    globalForOrchestrator.idempotencyMap = new Map<string, CachedIdempotency>();
  }

  return globalForOrchestrator.idempotencyMap;
}

function getPayloadDedupMap() {
  if (!globalForOrchestrator.payloadDedupMap) {
    globalForOrchestrator.payloadDedupMap = new Map<string, number>();
  }

  return globalForOrchestrator.payloadDedupMap;
}

function cleanupMaps() {
  const now = Date.now();
  const idempotencyMap = getIdempotencyMap();
  const dedupMap = getPayloadDedupMap();

  for (const [key, value] of idempotencyMap.entries()) {
    if (now - value.createdAt > IDEMPOTENCY_TTL_MS) {
      idempotencyMap.delete(key);
    }
  }

  for (const [key, createdAt] of dedupMap.entries()) {
    if (now - createdAt > DUPLICATE_WINDOW_MS) {
      dedupMap.delete(key);
    }
  }
}

function hashPayload(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function normalizeSubscriptionTier(plan: string): SubscriptionTier {
  if (plan === 'PRO') {
    return 'pro';
  }

  if (plan === 'BUSINESS' || plan === 'PREMIUM') {
    return 'premium';
  }

  return 'standard';
}

function isAutoPublishAllowed(input: OrchestrateContentInput, tier: SubscriptionTier) {
  return input.publishMode === 'auto' && tier === 'premium';
}

async function checkIntegrationPreflight(userId: string, requiredPlatforms: string[]) {
  const accounts = await prisma.socialAccount.findMany({
    where: {
      userId,
      platform: {
        in: requiredPlatforms as Array<'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK'>,
      },
    },
    select: {
      platform: true,
      accessToken: true,
      expiresAt: true,
    },
  });

  const now = Date.now();
  const missing = requiredPlatforms.filter((platform) => {
    const account = accounts.find((item) => item.platform === platform);
    if (!account || !account.accessToken) {
      return true;
    }

    if (account.expiresAt && account.expiresAt.getTime() <= now) {
      return true;
    }

    return false;
  });

  return {
    ok: missing.length === 0,
    missing,
  };
}

export async function orchestrateContent(userId: string, input: OrchestrateContentInput) {
  const runId = randomUUID();
  const warnings: string[] = [];
  let status: OrchestrateContentOutput['status'] = 'queued';

  cleanupMaps();

  const payloadHash = hashPayload({
    ...input,
    rawInputLength: input.rawInput?.length ?? 0,
  });

  const idempotencyStorageKey = `${userId}:${input.idempotencyKey}`;
  const idempotencyMap = getIdempotencyMap();
  const dedupMap = getPayloadDedupMap();

  const existing = idempotencyMap.get(idempotencyStorageKey);
  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      throw new OrchestrationBusinessError(
        409,
        'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
        'idempotencyKey zostało użyte z innym payloadem.',
      );
    }

    return existing.response;
  }

  const duplicateAt = dedupMap.get(payloadHash);
  if (duplicateAt && Date.now() - duplicateAt < DUPLICATE_WINDOW_MS) {
    throw new OrchestrationBusinessError(
      409,
      'DUPLICATE_PAYLOAD_BLOCKED',
      'Wykryto duplikat payloadu w krótkim oknie czasowym.',
    );
  }

  dedupMap.set(payloadHash, Date.now());

  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true },
  });

  const tier = normalizeSubscriptionTier(subscription?.plan ?? 'FREE');

  if (input.mode === 'ai-autopilot' && tier === 'standard') {
    throw new OrchestrationBusinessError(
      403,
      'FEATURE_NOT_AVAILABLE',
      'Tryb ai-autopilot jest dostępny od planu BUSINESS.',
    );
  }

  status = 'processing';
  const usedAI = input.mode === 'ai-autopilot';

  logEvent('smart-autopilot', 'orchestration-started', {
    runId,
    userId,
    mode: input.mode,
    publishMode: input.publishMode,
    rawInputLength: input.rawInput?.length ?? 0,
    mediaCount: input.mediaFiles?.length ?? 0,
  });

  try {
    const analysis = await analyzeInput(input, usedAI);

    if (analysis.confidence < 0.55) {
      warnings.push('Niska pewność klasyfikacji. Zastosowano neutralny fallback dla części reguł.');
      analysis.persona = 'neutral';
    }

    let bundles = transformByPersona(analysis, input);
    let schedule = optimizeSchedule(analysis, bundles, input);

    if (tier === 'pro' && input.mode === 'ai-autopilot') {
      bundles = bundles.slice(0, 2);
      schedule = schedule.filter((slot) => bundles.some((bundle) => bundle.platform === slot.platform));
      warnings.push('Plan PRO: aktywny Auto-Pilot Lite (ograniczone platform bundles i tylko draft mode).');
    }

    const strategySummary = buildStrategySummary(analysis, schedule);

    const hasCriticalSafety = analysis.safetyFlags.some((flag) => flag.severity === 'critical');

    if (hasCriticalSafety) {
      warnings.push('Wykryto krytyczne safety flags. Wymuszono tryb draft.');
      status = 'draft_ready';
    } else if (input.publishMode === 'auto') {
      const preflight = await checkIntegrationPreflight(
        userId,
        Array.from(new Set(bundles.map((bundle) => bundle.platform))),
      );

      if (!preflight.ok || !isAutoPublishAllowed(input, tier)) {
        warnings.push(
          preflight.ok
            ? 'Auto-publish niedostępny dla bieżącego planu. Zmieniono na draft.'
            : `Brak aktywnych integracji: ${preflight.missing.join(', ')}. Zmieniono na draft.`,
        );

        status = 'draft_ready';
      } else {
        status = 'scheduled';
      }
    } else {
      status = 'draft_ready';
    }

    const response: OrchestrateContentOutput = {
      analysis,
      platformBundles: bundles,
      schedule,
      strategySummary,
      warnings,
      usedAI,
      runId,
      status,
    };

    const outputValidation = validateOrchestrateContentOutput(response);
    if (!outputValidation.ok) {
      throw new OrchestrationBusinessError(
        500,
        'RESPONSE_SCHEMA_VALIDATION_FAILED',
        `Niepoprawna odpowiedź orchestratora: ${outputValidation.errors.join('; ')}`,
      );
    }

    idempotencyMap.set(idempotencyStorageKey, {
      payloadHash,
      response,
      createdAt: Date.now(),
    });

    logEvent('smart-autopilot', 'orchestration-completed', {
      runId,
      status,
      usedAI,
      warningCount: warnings.length,
      safetyFlagCount: response.analysis?.safetyFlags.length ?? 0,
    });

    return response;
  } catch (error) {
    status = 'failed';
    logError('smart-autopilot', 'orchestration-failed', error, {
      runId,
      status,
      mode: input.mode,
    });

    throw error;
  }
}
