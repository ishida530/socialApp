import { collectSafetyFlags, sanitizeUserInput } from './safety';
import { refineClassificationWithLlm } from './llm';
import type {
  AnalysisOutput,
  ContentType,
  Intent,
  OrchestrateContentInput,
  Persona,
} from './types';

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

  const llm = await refineClassificationWithLlm({
    textSample: sanitizedText,
    heuristicPersona,
    heuristicContentType,
    heuristicIntent,
  });

  if (!llm) {
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

  const resolvedPersona =
    llm.persona === 'video_creator' ||
    llm.persona === 'ecommerce_owner' ||
    llm.persona === 'real_estate_agent' ||
    llm.persona === 'neutral'
      ? llm.persona
      : heuristicPersona;

  const resolvedContentType =
    llm.contentType === 'video' ||
    llm.contentType === 'text' ||
    llm.contentType === 'image' ||
    llm.contentType === 'mixed' ||
    llm.contentType === 'unknown'
      ? llm.contentType
      : heuristicContentType;

  const resolvedIntent =
    llm.intent === 'promotional' ||
    llm.intent === 'educational' ||
    llm.intent === 'informational' ||
    llm.intent === 'listing' ||
    llm.intent === 'unknown'
      ? llm.intent
      : heuristicIntent;

  const resolvedConfidence =
    typeof llm.confidence === 'number' && llm.confidence >= 0 && llm.confidence <= 1
      ? llm.confidence
      : 0.7;

  return {
    persona: resolvedPersona,
    contentType: resolvedContentType,
    intent: resolvedIntent,
    confidence: resolvedConfidence,
    safetyFlags,
    unknownAspectRatio: aspect.unknownAspectRatio,
    aspectRatioConfidence: aspect.aspectRatioConfidence,
  };
}
