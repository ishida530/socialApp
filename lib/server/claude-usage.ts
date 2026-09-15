// EPIC 8 TASK-8.3 (Agent kosztow/FinOps, 2026-09-15). Recording is called from
// lib/server/anthropic-client.ts after every successful Claude response - best-effort, never
// allowed to fail or slow down the feature that actually made the call.
import { prisma } from './prisma';
import { logError } from './observability';

export async function recordClaudeUsage(scope: string, model: string, inputTokens: number, outputTokens: number): Promise<void> {
  try {
    await prisma.claudeUsageLog.create({ data: { scope, model, inputTokens, outputTokens } });
  } catch (error) {
    logError('claude-usage', 'record-usage-failed', error, { scope, model });
  }
}

// Publicly listed Anthropic per-million-token pricing (USD) as of this session's knowledge -
// prices change over time, so this is an ESTIMATE, not a bill. Verify against the real number at
// console.anthropic.com/settings/billing before treating it as authoritative. Unknown models fall
// back to the Sonnet-tier rate (the more expensive of the two used in this app) so a missing entry
// under-promises rather than silently hides real cost.
const PRICING_USD_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 3, output: 15 },
};
const FALLBACK_PRICING = { input: 3, output: 15 };

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING_USD_PER_MILLION_TOKENS[model] ?? FALLBACK_PRICING;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

export type ClaudeCostSummary = {
  periodDays: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  byScope: Array<{ scope: string; calls: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number }>;
};

export async function getClaudeCostSummary(periodDays = 30): Promise<ClaudeCostSummary> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.claudeUsageLog.findMany({
    where: { createdAt: { gte: since } },
    select: { scope: true, model: true, inputTokens: true, outputTokens: true },
  });

  const byScopeMap = new Map<string, { calls: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number }>();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let estimatedCostUsd = 0;

  for (const row of rows) {
    const cost = estimateCostUsd(row.model, row.inputTokens, row.outputTokens);
    totalInputTokens += row.inputTokens;
    totalOutputTokens += row.outputTokens;
    estimatedCostUsd += cost;

    const existing = byScopeMap.get(row.scope) ?? { calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
    existing.calls += 1;
    existing.inputTokens += row.inputTokens;
    existing.outputTokens += row.outputTokens;
    existing.estimatedCostUsd += cost;
    byScopeMap.set(row.scope, existing);
  }

  const byScope = Array.from(byScopeMap.entries())
    .map(([scope, stats]) => ({ scope, ...stats }))
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

  return {
    periodDays,
    totalCalls: rows.length,
    totalInputTokens,
    totalOutputTokens,
    estimatedCostUsd,
    byScope,
  };
}
