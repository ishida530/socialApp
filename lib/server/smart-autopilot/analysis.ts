import { collectSafetyFlags, sanitizeUserInput } from './safety';
import { refineClassificationWithLlm } from './llm';
import { logError, logEvent } from '@/lib/server/observability';
import type {
  AnalysisOutput,
  ContentType,
  Intent,
  OrchestrateContentInput,
  Persona,
} from './types';

const VALID_PERSONAS: Persona[] = ['video_creator', 'ecommerce_owner', 'real_estate_agent', 'neutral'];
const VALID_CONTENT_TYPES: ContentType[] = ['video', 'text', 'image', 'mixed', 'unknown'];
const VALID_INTENTS: Intent[] = ['promotional', 'educational', 'informational', 'listing', 'unknown'];

type ValidatedClassification = {
  persona: Persona;
  contentType: ContentType;
  intent: Intent;
  confidence: number;
};

// TASK-4.1.1: walidacja schematu odpowiedzi LLM wykraczająca poza to, co strukturalnie wymusza
// tool-use Claude (poprawny KSZTAŁT JSON-a nie gwarantuje poprawnych WARTOŚCI - model bywa
// twórczy z enumami mimo forced tool_choice). Całościowa walidacja (nie per-pole), żeby nigdy nie
// zapisać niespójnej mieszanki częściowo-poprawnych pól.
function validateLlmClassification(
  result: Awaited<ReturnType<typeof refineClassificationWithLlm>>,
): { ok: true; value: ValidatedClassification } | { ok: false; errors: string[] } {
  if (!result) {
    return { ok: false, errors: ['Brak odpowiedzi od modelu.'] };
  }

  const errors: string[] = [];

  if (!VALID_PERSONAS.includes(result.persona as Persona)) {
    errors.push(`persona musi być jedną z: ${VALID_PERSONAS.join(', ')} (otrzymano: ${result.persona})`);
  }
  if (!VALID_CONTENT_TYPES.includes(result.contentType as ContentType)) {
    errors.push(`contentType musi być jednym z: ${VALID_CONTENT_TYPES.join(', ')} (otrzymano: ${result.contentType})`);
  }
  if (!VALID_INTENTS.includes(result.intent as Intent)) {
    errors.push(`intent musi być jednym z: ${VALID_INTENTS.join(', ')} (otrzymano: ${result.intent})`);
  }
  if (
    typeof result.confidence !== 'number' ||
    !Number.isFinite(result.confidence) ||
    result.confidence < 0 ||
    result.confidence > 1
  ) {
    errors.push(`confidence musi być liczbą w zakresie 0..1 (otrzymano: ${result.confidence})`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      persona: result.persona as Persona,
      contentType: result.contentType as ContentType,
      intent: result.intent as Intent,
      confidence: result.confidence as number,
    },
  };
}

const MAX_CLASSIFICATION_ATTEMPTS = 2;

// TASK-4.1.1: pętla retry z poprawionym promptem (maks. 2 próby) - druga próba dostaje dokładny
// powód odrzucenia pierwszej (correctionNote), zamiast ślepo powtarzać to samo pytanie.
// TASK-4.1.2: gdy obie próby zawiodą, funkcja zwraca null (wołający spada na czysto
// heurystyczną klasyfikację - nigdy nie zapisuje nieprawidłowego planu) i emituje logError jako
// alert, zamiast cicho gubić powtarzający się błąd.
async function classifyWithValidation(params: {
  textSample: string;
  heuristicPersona: Persona;
  heuristicContentType: ContentType;
  heuristicIntent: Intent;
}): Promise<ValidatedClassification | null> {
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_CLASSIFICATION_ATTEMPTS; attempt += 1) {
    const llm = await refineClassificationWithLlm({
      textSample: params.textSample,
      heuristicPersona: params.heuristicPersona,
      heuristicContentType: params.heuristicContentType,
      heuristicIntent: params.heuristicIntent,
      correctionNote: attempt > 1 ? lastErrors.join('; ') : undefined,
    });

    const validated = validateLlmClassification(llm);
    if (validated.ok) {
      return validated.value;
    }

    lastErrors = validated.errors;
    logEvent('smart-autopilot', 'llm-classification-attempt-invalid', { attempt, errors: lastErrors });
  }

  logError(
    'smart-autopilot',
    'llm-classification-failed-after-retries',
    new Error(lastErrors.join('; ') || 'brak odpowiedzi'),
    { attempts: MAX_CLASSIFICATION_ATTEMPTS },
  );

  return null;
}

function detectPersonaHeuristic(rawInput: string, hint?: Persona): Persona {
  if (hint && hint !== 'neutral') {
    return hint;
  }

  const text = rawInput.toLowerCase();

  if (/listing|property|sqm|rooms|viewing|real estate|nieruchomo/i.test(text)) {
    return 'real_estate_agent';
  }

  if (/shop|sku|product|cart|sale|discount|e-?commerce|link in bio/i.test(text)) {
    return 'ecommerce_owner';
  }

  if (/creator|shorts|reel|tiktok|youtube|ugc|video/i.test(text)) {
    return 'video_creator';
  }

  return 'neutral';
}

function detectContentTypeHeuristic(input: OrchestrateContentInput): ContentType {
  const hasMedia = (input.mediaFiles?.length ?? 0) > 0;
  const hasText = Boolean(input.rawInput?.trim());

  if (hasMedia && hasText) {
    return 'mixed';
  }

  if (hasMedia) {
    const videoLike = input.mediaFiles?.some((file) =>
      (file.mimeType || '').toLowerCase().startsWith('video/'),
    );
    return videoLike ? 'video' : 'image';
  }

  if (hasText) {
    return 'text';
  }

  return 'unknown';
}

function detectIntentHeuristic(rawInput: string): Intent {
  const text = rawInput.toLowerCase();

  if (/price|discount|offer|buy|shop|promo|limited/i.test(text)) {
    return 'promotional';
  }

  if (/guide|tips|how to|tutorial|learn/i.test(text)) {
    return 'educational';
  }

  if (/listing|property|rooms|sqm|price per|location/i.test(text)) {
    return 'listing';
  }

  if (text.trim().length > 0) {
    return 'informational';
  }

  return 'unknown';
}

function resolveAspectRatioConfidence(input: OrchestrateContentInput) {
  const first = input.mediaFiles?.[0];
  if (!first?.width || !first?.height) {
    return {
      unknownAspectRatio: true,
      aspectRatioConfidence: 0.3,
    };
  }

  return {
    unknownAspectRatio: false,
    aspectRatioConfidence: 0.9,
  };
}

export async function analyzeInput(input: OrchestrateContentInput, useAi: boolean): Promise<AnalysisOutput> {
  const sanitizedText = sanitizeUserInput(input.rawInput);

  const heuristicPersona = detectPersonaHeuristic(sanitizedText, input.personaHint);
  const heuristicContentType = detectContentTypeHeuristic(input);
  const heuristicIntent = detectIntentHeuristic(sanitizedText);
  const safetyFlags = collectSafetyFlags({
    rawInput: sanitizedText,
    publishMode: input.publishMode,
  });

  const aspect = resolveAspectRatioConfidence(input);

  if (!useAi) {
    return {
      persona: heuristicPersona,
      contentType: heuristicContentType,
      intent: heuristicIntent,
      confidence: 0.72,
      safetyFlags,
      unknownAspectRatio: aspect.unknownAspectRatio,
      aspectRatioConfidence: aspect.aspectRatioConfidence,
    };
  }

  const validated = await classifyWithValidation({
    textSample: sanitizedText,
    heuristicPersona,
    heuristicContentType,
    heuristicIntent,
  });

  if (!validated) {
    return {
      persona: heuristicPersona,
      contentType: heuristicContentType,
      intent: heuristicIntent,
      confidence: 0.65,
      safetyFlags,
      unknownAspectRatio: aspect.unknownAspectRatio,
      aspectRatioConfidence: aspect.aspectRatioConfidence,
    };
  }

  return {
    persona: validated.persona,
    contentType: validated.contentType,
    intent: validated.intent,
    confidence: validated.confidence,
    safetyFlags,
    unknownAspectRatio: aspect.unknownAspectRatio,
    aspectRatioConfidence: aspect.aspectRatioConfidence,
  };
}
