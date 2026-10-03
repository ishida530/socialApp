// Shared low-level client for Claude (Anthropic Messages API) calls used across the app's
// optional AI features (Smart Autopilot classification, per-platform content generation).
// Every caller gets the same contract: configured -> best-effort JSON via forced tool-use,
// unconfigured or failing -> null, so callers can fall back to a deterministic non-AI path
// instead of hard-failing the request.
import { recordClaudeUsage } from './claude-usage';
import { reportAiProviderProblem } from './ai-alerts';

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 5000;
const ANTHROPIC_VERSION = '2023-06-01';

export const CLAUDE_MODELS = {
  // Small, fast, cheap - a strict single-label classification task doesn't need more.
  classification: process.env.ANTHROPIC_CLASSIFICATION_MODEL ?? 'claude-haiku-4-5-20251001',
  // Creative writing quality matters here (actual post copy shown to real audiences). Compare
  // candidates with `npm run eval:captions` before changing it (evals/README.md).
  contentGeneration: process.env.ANTHROPIC_CONTENT_MODEL ?? 'claude-sonnet-5',
  // Short, low-stakes texts (comment reply suggestions, content ideas, style suggestion) - about a
  // third of the Sonnet price; post copy and the assistant stay on contentGeneration (2026-10-03).
  lightweight: process.env.ANTHROPIC_LIGHT_MODEL ?? 'claude-haiku-4-5-20251001',
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

// 2026-10-02 (AI review): only transient failures are worth another attempt - rate limit (429),
// overload (529), server errors (5xx), timeouts/conflicts (408/409) and network errors. A 400
// (e.g. exhausted credit balance, invalid request), 401 or 403 fails the same way every time, so
// retrying it only multiplied the latency of the template fallback.
function isRetryableStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

// Some models reject a forced tool call ("tool_choice: type "tool" and "any" are not supported for
// this model" - seen with claude-sonnet-5-5 on 2026-10-03). Those models get tool_choice "auto"
// plus an explicit instruction to answer through the tool; remembered per model for the lifetime
// of the server instance, so only the very first call pays for the extra round trip.
const modelsWithoutForcedToolChoice = new Set<string>();

function rejectsForcedToolChoice(status: number, message: string) {
  return status === 400 && /tool_choice/i.test(message) && /not supported/i.test(message);
}

function retryDelayMs(response: Response | null, attempt: number) {
  const retryAfter = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS);
  }
  return 400 * attempt;
}

// 2026-10-02: API errors used to be swallowed silently, so an exhausted credit balance showed up
// only as template captions ("Krótka aktualizacja: ..."). Logged as an error (Vercel logs, and
// Sentry once configured) with Anthropic's own error type and message - never the request or key.
// Account-level problems (credits, key) also email the admin - see lib/server/ai-alerts.ts.
async function readAnthropicError(response: Response) {
  try {
    const body = (await response.json()) as { error?: { type?: string; message?: string } };
    return { type: body.error?.type ?? '', message: body.error?.message ?? '' };
  } catch {
    // Non-JSON error body - the status code alone is still useful.
    return { type: '', message: '' };
  }
}

async function logAnthropicFailure(
  scope: string,
  model: string,
  response: Response,
  error?: { type: string; message: string },
) {
  const { type, message } = error ?? (await readAnthropicError(response));
  const detail = [type, message].filter(Boolean).join(': ').slice(0, 300);
  console.error('[anthropic] request failed', { scope, model, status: response.status, detail });
  await reportAiProviderProblem({ status: response.status, type, message });
}

type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

// Cache writes and reads are billed as input tokens too (at different rates) - counted into the
// input total so the FinOps estimate doesn't silently drop them.
function totalInputTokens(usage?: AnthropicUsage) {
  return (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0);
}

type AnthropicToolResponse = {
  content?: Array<{ type: string; name?: string; input?: unknown }>;
  usage?: AnthropicUsage;
};

// Image input (2026-10-02): the post's photo / video thumbnail is sent alongside the text so the
// caption describes what's actually in the material. Public Blob URLs - Anthropic fetches them.
export type AnthropicUserContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; url: string } };

// Agent-mentor (multi-tool, model-driven tool_choice) support - deliberately separate from
// callClaudeTool above, which forces exactly one tool and returns only its parsed input. This one
// returns the raw content blocks (text and/or tool_use) so a caller can drive a multi-round
// tool-use loop itself (lib/server/telegram-mentor-agent.ts).
export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export type AnthropicAgentMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
};

export async function callClaudeAgentTurn(params: {
  // TASK-8.3 (FinOps, 2026-09-15): which feature is calling, so token usage can be broken down
  // per feature - see lib/server/claude-usage.ts.
  scope: string;
  model: string;
  system: string;
  messages: AnthropicAgentMessage[];
  tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
  maxTokens?: number;
  timeoutMs?: number;
  // 'none' = answer in text only (used for the final wrap-up when the tool-round budget is spent).
  toolChoice?: 'auto' | 'none';
}): Promise<{ content: AnthropicContentBlock[]; stopReason?: string } | null> {
  const config = getAnthropicConfig();
  if (!config) {
    return null;
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
        // Prompt caching (2026-10-02): the system prompt and the tool definitions are identical on
        // every turn of the mentor agent - marking their end as a cache breakpoint lets Anthropic
        // reuse that prefix instead of re-processing it on each message (cheaper and faster).
        system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }],
        messages: params.messages,
        tools: params.tools.map((tool, index) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema,
          ...(index === params.tools.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
        })),
        ...(params.toolChoice === 'none' ? { tool_choice: { type: 'none' } } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      await logAnthropicFailure(params.scope, params.model, response);
      return null;
    }

    const payload = (await response.json()) as {
      content?: AnthropicContentBlock[];
      stop_reason?: string;
      usage?: AnthropicUsage;
    };
    if (!Array.isArray(payload.content)) {
      return null;
    }

    // recordClaudeUsage swallows its own errors internally (best-effort) - awaited here anyway
    // since the write itself is cheap next to the Claude call that already happened, and it keeps
    // "the call is recorded" a real guarantee by the time this function returns, not a race.
    await recordClaudeUsage(params.scope, params.model, totalInputTokens(payload.usage), payload.usage?.output_tokens ?? 0);

    return { content: payload.content, stopReason: payload.stop_reason };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function callClaudeTool<T>(params: {
  // TASK-8.3 (FinOps, 2026-09-15): which feature is calling, so token usage can be broken down
  // per feature - see lib/server/claude-usage.ts.
  scope: string;
  model: string;
  system: string;
  // A plain string, or content blocks when the request carries images.
  userContent: string | AnthropicUserContentBlock[];
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

  let forcedToolChoiceRejected = false;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const forceTool = !modelsWithoutForcedToolChoice.has(params.model);

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
          system: forceTool
            ? params.system
            : `${params.system}\n\nOdpowiedz WYŁĄCZNIE wywołaniem narzędzia "${params.tool.name}", bez żadnego tekstu poza nim.`,
          messages: [{ role: 'user', content: params.userContent }],
          tools: [
            {
              name: params.tool.name,
              description: params.tool.description,
              input_schema: params.tool.input_schema,
            },
          ],
          tool_choice: forceTool ? { type: 'tool', name: params.tool.name } : { type: 'auto' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await readAnthropicError(response);

        // Model without forced tool use: switch to "auto" once and retry right away (doesn't
        // count as one of the transient-error retries).
        if (forceTool && !forcedToolChoiceRejected && rejectsForcedToolChoice(response.status, error.message)) {
          modelsWithoutForcedToolChoice.add(params.model);
          forcedToolChoiceRejected = true;
          attempt -= 1;
          continue;
        }

        if (attempt <= maxRetries && isRetryableStatus(response.status)) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response, attempt)));
          continue;
        }

        await logAnthropicFailure(params.scope, params.model, response, error);
        return null;
      }

      const payload = (await response.json()) as AnthropicToolResponse;

      // Recorded even when the tool-use block itself ends up unusable below, since the tokens
      // were still spent either way. Awaited (not fire-and-forget) so "the call is recorded" is a
      // real guarantee by the time this function returns - recordClaudeUsage swallows its own
      // errors internally, so this can never make an otherwise-successful call fail.
      await recordClaudeUsage(params.scope, params.model, totalInputTokens(payload.usage), payload.usage?.output_tokens ?? 0);

      const toolUseBlock = payload.content?.find(
        (block) => block.type === 'tool_use' && block.name === params.tool.name,
      );

      if (!toolUseBlock || typeof toolUseBlock.input !== 'object' || toolUseBlock.input === null) {
        return null;
      }

      return toolUseBlock.input as T;
    } catch {
      // Network error or our own timeout - transient by nature.
      if (attempt <= maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(null, attempt)));
        continue;
      }

      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}
