// Shared low-level client for Claude (Anthropic Messages API) calls used across the app's
// optional AI features (Smart Autopilot classification, per-platform content generation).
// Every caller gets the same contract: configured -> best-effort JSON via forced tool-use,
// unconfigured or failing -> null, so callers can fall back to a deterministic non-AI path
// instead of hard-failing the request.

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_RETRIES = 2;
const ANTHROPIC_VERSION = '2023-06-01';

export const CLAUDE_MODELS = {
  // Small, fast, cheap - a strict single-label classification task doesn't need more.
  classification: process.env.ANTHROPIC_CLASSIFICATION_MODEL ?? 'claude-haiku-4-5-20251001',
  // Creative writing quality matters here (actual post copy shown to real audiences).
  contentGeneration: process.env.ANTHROPIC_CONTENT_MODEL ?? 'claude-sonnet-5',
};

function getAnthropicConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    endpoint: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1/messages',
    apiKey,
  };
}

type AnthropicToolResponse = {
  content?: Array<{ type: string; name?: string; input?: unknown }>;
};

export async function callClaudeTool<T>(params: {
  model: string;
  system: string;
  userContent: string;
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<T | null> {
  const config = getAnthropicConfig();
  if (!config) {
    return null;
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = params.maxRetries ?? DEFAULT_MAX_RETRIES;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: params.model,
          max_tokens: params.maxTokens ?? 1024,
          system: params.system,
          messages: [{ role: 'user', content: params.userContent }],
          tools: [
            {
              name: params.tool.name,
              description: params.tool.description,
              input_schema: params.tool.input_schema,
            },
          ],
          tool_choice: { type: 'tool', name: params.tool.name },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (attempt <= maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          continue;
        }

        return null;
      }

      const payload = (await response.json()) as AnthropicToolResponse;
      const toolUseBlock = payload.content?.find(
        (block) => block.type === 'tool_use' && block.name === params.tool.name,
      );

      if (!toolUseBlock || typeof toolUseBlock.input !== 'object' || toolUseBlock.input === null) {
        return null;
      }

      return toolUseBlock.input as T;
    } catch {
      if (attempt <= maxRetries) {
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
