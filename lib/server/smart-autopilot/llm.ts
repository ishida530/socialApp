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
].join(' ');

export async function refineClassificationWithLlm(input: {
  textSample: string;
  heuristicPersona: string;
  heuristicContentType: string;
  heuristicIntent: string;
}): Promise<LlmRefinementResult | null> {
  const userContent = JSON.stringify({
    heuristic: {
      persona: input.heuristicPersona,
      contentType: input.heuristicContentType,
      intent: input.heuristicIntent,
    },
    textSample: input.textSample.slice(0, 1500),
  });

  return callClaudeTool<LlmRefinementResult>({
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
