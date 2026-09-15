import { callClaudeTool, CLAUDE_MODELS } from '@/lib/server/anthropic-client';

type LlmRefinementResult = {
  persona?: 'video_creator' | 'ecommerce_owner' | 'real_estate_agent' | 'neutral';
  contentType?: 'video' | 'text' | 'image' | 'mixed' | 'unknown';
  intent?: 'promotional' | 'educational' | 'informational' | 'listing' | 'unknown';
  confidence?: number;
  reason?: string;
};

const CLASSIFY_SYSTEM_PROMPT = [
  'You are a strict classifier for a social media scheduling tool.',
  'Given a heuristic guess and a text sample, confirm or refine the classification.',
  'persona: video_creator | ecommerce_owner | real_estate_agent | neutral.',
  'contentType: video | text | image | mixed | unknown.',
  'intent: promotional | educational | informational | listing | unknown.',
  'confidence: your own confidence in this classification, 0..1.',
  'If the input includes "previousAttemptError", your prior response was rejected for that exact reason - fix it, using only the allowed enum values listed above and a confidence strictly between 0 and 1.',
].join(' ');

export async function refineClassificationWithLlm(input: {
  textSample: string;
  heuristicPersona: string;
  heuristicContentType: string;
  heuristicIntent: string;
  // TASK-4.1.1: set on a retry after the first attempt failed schema/business-rule validation
  // (see analysis.ts classifyWithValidation) - tells the model exactly what was wrong last time
  // instead of blindly repeating the same request and risking the same invalid output again.
  correctionNote?: string;
}): Promise<LlmRefinementResult | null> {
  const userContent = JSON.stringify({
    heuristic: {
      persona: input.heuristicPersona,
      contentType: input.heuristicContentType,
      intent: input.heuristicIntent,
    },
    textSample: input.textSample.slice(0, 1500),
    ...(input.correctionNote ? { previousAttemptError: input.correctionNote } : {}),
  });

  return callClaudeTool<LlmRefinementResult>({
    scope: 'smart-autopilot-classify',
    model: CLAUDE_MODELS.classification,
    system: CLASSIFY_SYSTEM_PROMPT,
    userContent,
    tool: {
      name: 'classify_content',
      description: 'Classify the persona, content type, and intent of a piece of social media content.',
      input_schema: {
        type: 'object',
        properties: {
          persona: {
            type: 'string',
            enum: ['video_creator', 'ecommerce_owner', 'real_estate_agent', 'neutral'],
          },
          contentType: {
            type: 'string',
            enum: ['video', 'text', 'image', 'mixed', 'unknown'],
          },
          intent: {
            type: 'string',
            enum: ['promotional', 'educational', 'informational', 'listing', 'unknown'],
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reason: { type: 'string' },
        },
      },
    },
    maxTokens: 300,
    timeoutMs: 8000,
  });
}
