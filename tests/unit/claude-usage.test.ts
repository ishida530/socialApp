import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { getClaudeCostSummary, recordClaudeUsage } from '@/lib/server/claude-usage';
import { prisma } from '@/lib/server/prisma';

// EPIC 8 TASK-8.3 (Agent kosztow/FinOps, 2026-09-15): Claude is the only paid component of this
// app, but there was never any visibility into what it actually costs - this closes that gap.
//
// ClaudeUsageLog is deliberately a GLOBAL table (cost is app-wide, not per-user - see
// lib/server/claude-usage.ts), unlike every other model in this app's tests, which clean up via
// deleteTestUser cascading. Vitest runs test files in parallel across workers sharing the same
// test database, and plenty of OTHER test files exercise callClaudeTool/callClaudeAgentTurn with
// mocked successful responses - each one now writes a real ClaudeUsageLog row too. Asserting on
// getClaudeCostSummary's GLOBAL totals here would be flaky (passed locally, failed in CI once -
// exactly the "fewer cores locally" class of bug this project has hit before). Every test below
// instead uses a randomized, unique `scope` per case and reads only that scope's entry out of
// `byScope` - immune to whatever unrelated rows concurrent tests are writing.

function uniqueScope(label: string) {
  return `test-${label}-${randomUUID()}`;
}

describe('recordClaudeUsage / getClaudeCostSummary', () => {
  it('records a call and includes it in the summary with an estimated cost', async () => {
    const scope = uniqueScope('single-call');
    await recordClaudeUsage(scope, 'claude-sonnet-5', 1000, 500);

    const summary = await getClaudeCostSummary(30);
    const entry = summary.byScope.find((row) => row.scope === scope);

    expect(entry?.calls).toBe(1);
    expect(entry?.inputTokens).toBe(1000);
    expect(entry?.outputTokens).toBe(500);
    // 1000/1e6 * $3 + 500/1e6 * $15 = 0.003 + 0.0075 = 0.0105
    expect(entry?.estimatedCostUsd).toBeCloseTo(0.0105, 6);
  });

  it('aggregates multiple calls under the same scope', async () => {
    const scope = uniqueScope('multi-call');
    await recordClaudeUsage(scope, 'claude-sonnet-5', 1000, 500);
    await recordClaudeUsage(scope, 'claude-sonnet-5', 1000, 500);

    const summary = await getClaudeCostSummary(30);
    const entry = summary.byScope.find((row) => row.scope === scope);

    expect(entry?.calls).toBe(2);
    expect(entry?.inputTokens).toBe(2000);
    expect(entry?.outputTokens).toBe(1000);
  });

  it('applies the fallback (more expensive) pricing tier for an unrecognized model, rather than silently under-counting cost', async () => {
    const scope = uniqueScope('unknown-model');
    await recordClaudeUsage(scope, 'some-future-model', 1_000_000, 1_000_000);

    const summary = await getClaudeCostSummary(30);
    const entry = summary.byScope.find((row) => row.scope === scope);

    // Fallback pricing: $3 input + $15 output per million = $18 for 1M/1M tokens.
    expect(entry?.estimatedCostUsd).toBeCloseTo(18, 6);
  });

  it('excludes calls outside the requested period', async () => {
    const scope = uniqueScope('old-call');
    await prisma.claudeUsageLog.create({
      data: {
        scope,
        model: 'claude-sonnet-5',
        inputTokens: 1000,
        outputTokens: 500,
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      },
    });

    const summary = await getClaudeCostSummary(30);
    expect(summary.byScope.find((row) => row.scope === scope)).toBeUndefined();
  });

  it('never throws when called with edge-case input', async () => {
    const scope = uniqueScope('edge-case');
    await expect(recordClaudeUsage(scope, 'claude-sonnet-5', 10, 5)).resolves.toBeUndefined();
  });
});
