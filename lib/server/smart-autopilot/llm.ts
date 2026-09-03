type LlmRefinementResult = {
  persona?: 'video_creator' | 'ecommerce_owner' | 'real_estate_agent' | 'neutral';
  contentType?: 'video' | 'text' | 'image' | 'mixed' | 'unknown';
  intent?: 'promotional' | 'educational' | 'informational' | 'listing' | 'unknown';
  confidence?: number;
  reason?: string;
};

const REQUEST_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

function parseRefinementPayload(rawText: string): LlmRefinementResult | null {
  try {
    const parsed = JSON.parse(rawText) as LlmRefinementResult;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function getLlmConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    endpoint: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1/chat/completions',
    model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
    apiKey,
  };
}

export async function refineClassificationWithLlm(input: {
  textSample: string;
  heuristicPersona: string;
  heuristicContentType: string;
  heuristicIntent: string;
}) {
  const config = getLlmConfig();
  if (!config) {
    return null;
  }

  const systemPrompt = [
    'You are a strict JSON classifier.',
    'Return ONLY valid minified JSON.',
    'Never output markdown.',
    'Keys allowed: persona, contentType, intent, confidence, reason.',
    'persona: video_creator | ecommerce_owner | real_estate_agent | neutral',
    'contentType: video | text | image | mixed | unknown',
    'intent: promotional | educational | informational | listing | unknown',
    'confidence: number 0..1',
  ].join(' ');

  const userPrompt = JSON.stringify({
    heuristic: {
      persona: input.heuristicPersona,
      contentType: input.heuristicContentType,
      intent: input.heuristicIntent,
    },
    textSample: input.textSample.slice(0, 1500),
  });

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (attempt <= MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          continue;
        }

        return null;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        return null;
      }

      const parsed = parseRefinementPayload(content);
      if (!parsed) {
        return null;
      }

      return parsed;
    } catch {
      if (attempt <= MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        continue;
      }

      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}
