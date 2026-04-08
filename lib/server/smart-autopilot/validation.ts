import type {
  AnalysisOutput,
  MediaFileInput,
  OrchestrateContentInput,
  OrchestrateContentOutput,
  Persona,
  PerformanceDataInput,
  PlatformBundle,
} from './types';

const ALLOWED_PERSONAS = new Set<Persona>([
  'video_creator',
  'ecommerce_owner',
  'real_estate_agent',
  'neutral',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function validateMediaFiles(mediaFiles: unknown, errors: string[]) {
  if (mediaFiles === undefined) {
    return;
  }

  if (!Array.isArray(mediaFiles)) {
    errors.push('mediaFiles musi być tablicą');
    return;
  }

  mediaFiles.forEach((file, index) => {
    if (!isObject(file)) {
      errors.push(`mediaFiles[${index}] musi być obiektem`);
      return;
    }

    const typed = file as MediaFileInput;

    if (typed.width !== undefined && (!Number.isFinite(typed.width) || typed.width <= 0)) {
      errors.push(`mediaFiles[${index}].width musi być liczbą > 0`);
    }
    if (typed.height !== undefined && (!Number.isFinite(typed.height) || typed.height <= 0)) {
      errors.push(`mediaFiles[${index}].height musi być liczbą > 0`);
    }
    if (typed.duration !== undefined && (!Number.isFinite(typed.duration) || typed.duration < 0)) {
      errors.push(`mediaFiles[${index}].duration musi być liczbą >= 0`);
    }
  });
}

function validatePerformanceData(performanceData: unknown, errors: string[]) {
  if (performanceData === undefined) {
    return;
  }

  if (!Array.isArray(performanceData)) {
    errors.push('performanceData musi być tablicą');
    return;
  }

  performanceData.forEach((row, index) => {
    if (!isObject(row)) {
      errors.push(`performanceData[${index}] musi być obiektem`);
      return;
    }

    const typed = row as PerformanceDataInput;

    if (
      typed.platform !== 'TIKTOK' &&
      typed.platform !== 'INSTAGRAM' &&
      typed.platform !== 'YOUTUBE' &&
      typed.platform !== 'FACEBOOK'
    ) {
      errors.push(`performanceData[${index}].platform jest niepoprawne`);
    }

    if (!Number.isFinite(typed.hour) || typed.hour < 0 || typed.hour > 23) {
      errors.push(`performanceData[${index}].hour musi być w zakresie 0..23`);
    }
  });
}

function validateTargetPlatforms(targetPlatforms: unknown, errors: string[]) {
  if (targetPlatforms === undefined) {
    return;
  }

  if (!Array.isArray(targetPlatforms)) {
    errors.push('targetPlatforms musi być tablicą');
    return;
  }

  targetPlatforms.forEach((platform, index) => {
    if (
      platform !== 'TIKTOK' &&
      platform !== 'INSTAGRAM' &&
      platform !== 'YOUTUBE' &&
      platform !== 'FACEBOOK'
    ) {
      errors.push(`targetPlatforms[${index}] jest niepoprawne`);
    }
  });
}

export function validateOrchestrateContentInput(payload: unknown) {
  const errors: string[] = [];
  if (!isObject(payload)) {
    return {
      ok: false as const,
      errors: ['Body żądania musi być obiektem JSON'],
    };
  }

  const body = payload as Record<string, unknown>;

  if (body.rawInput !== undefined && typeof body.rawInput !== 'string') {
    errors.push('rawInput musi być stringiem');
  }

  if (typeof body.timezone !== 'string' || !body.timezone.trim()) {
    errors.push('timezone jest wymagane i musi być stringiem');
  } else if (!isValidTimezone(body.timezone)) {
    errors.push('timezone jest niepoprawne (IANA)');
  }

  if (body.mode !== 'manual' && body.mode !== 'ai-autopilot') {
    errors.push('mode musi być: manual | ai-autopilot');
  }

  if (body.publishMode !== 'draft' && body.publishMode !== 'auto') {
    errors.push('publishMode musi być: draft | auto');
  }

  if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim().length < 8) {
    errors.push('idempotencyKey jest wymagane (min. 8 znaków)');
  }

  if (
    body.subscriptionTier !== undefined &&
    body.subscriptionTier !== 'standard' &&
    body.subscriptionTier !== 'pro' &&
    body.subscriptionTier !== 'premium'
  ) {
    errors.push('subscriptionTier musi być: standard | pro | premium');
  }

  if (body.personaHint !== undefined) {
    if (typeof body.personaHint !== 'string' || !ALLOWED_PERSONAS.has(body.personaHint as Persona)) {
      errors.push('personaHint jest niepoprawne');
    }
  }

  validateMediaFiles(body.mediaFiles, errors);
  validatePerformanceData(body.performanceData, errors);
  validateTargetPlatforms(body.targetPlatforms, errors);

  if (errors.length > 0) {
    return {
      ok: false as const,
      errors,
    };
  }

  const input: OrchestrateContentInput = {
    personaHint: body.personaHint as Persona | undefined,
    rawInput: (body.rawInput as string | undefined)?.trim() || undefined,
    mediaFiles: body.mediaFiles as MediaFileInput[] | undefined,
    targetPlatforms: Array.isArray(body.targetPlatforms)
      ? Array.from(new Set(body.targetPlatforms)) as OrchestrateContentInput['targetPlatforms']
      : undefined,
    timezone: body.timezone as string,
    performanceData: body.performanceData as PerformanceDataInput[] | undefined,
    mode: body.mode as OrchestrateContentInput['mode'],
    subscriptionTier: body.subscriptionTier as OrchestrateContentInput['subscriptionTier'] | undefined,
    publishMode: body.publishMode as OrchestrateContentInput['publishMode'],
    idempotencyKey: (body.idempotencyKey as string).trim(),
  };

  return {
    ok: true as const,
    value: input,
  };
}

function validateAnalysis(analysis: AnalysisOutput, errors: string[]) {
  if (!ALLOWED_PERSONAS.has(analysis.persona)) {
    errors.push('analysis.persona jest niepoprawne');
  }

  if (!Number.isFinite(analysis.confidence) || analysis.confidence < 0 || analysis.confidence > 1) {
    errors.push('analysis.confidence musi być w zakresie 0..1');
  }

  if (!Array.isArray(analysis.safetyFlags)) {
    errors.push('analysis.safetyFlags musi być tablicą');
  }
}

function validateBundles(platformBundles: PlatformBundle[], errors: string[]) {
  if (!Array.isArray(platformBundles) || platformBundles.length === 0) {
    errors.push('platformBundles musi zawierać co najmniej 1 element');
    return;
  }

  platformBundles.forEach((bundle, index) => {
    if (!bundle.caption?.trim()) {
      errors.push(`platformBundles[${index}].caption jest wymagane`);
    }
    if (!Array.isArray(bundle.hashtags)) {
      errors.push(`platformBundles[${index}].hashtags musi być tablicą`);
    }
  });
}

export function validateOrchestrateContentOutput(payload: OrchestrateContentOutput) {
  const errors: string[] = [];

  if (!payload.runId?.trim()) {
    errors.push('runId jest wymagane');
  }

  if (!payload.status) {
    errors.push('status jest wymagane');
  }

  if (!Array.isArray(payload.warnings)) {
    errors.push('warnings musi być tablicą');
  }

  validateBundles(payload.platformBundles, errors);

  if (!Array.isArray(payload.schedule)) {
    errors.push('schedule musi być tablicą');
  }

  if (payload.analysis) {
    validateAnalysis(payload.analysis, errors);
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
