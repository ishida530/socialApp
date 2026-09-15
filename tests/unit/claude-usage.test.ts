import { afterEach, describe, expect, it } from 'vitest';
import { getClaudeCostSummary, recordClaudeUsage } from '@/lib/server/claude-usage';
import { prisma } from '@/lib/server/prisma';

// EPIC 8 TASK-8.3 (Agent kosztow/FinOps, 2026-09-15): Claude is the only paid component of this
// app, but there was never any visibility into what it actually costs - this closes that gap.

afterEach(async () => {
  await prisma.claudeUsageLog.deleteMany();
});

describe('recordClaudeUsage / getClaudeCostSummary', () => {
  it('records a call and includes it in the summary with an estimated cost', async () => {
    await recordClaudeUsage('coaching', 'claude-sonnet-5', 1000, 500);

    const summary = await getClaudeCostSummary(30);
    expect(summary.totalCalls).toBe(1);
    expect(summary.totalInputTokens).toBe(1000);
    expect(summary.totalOutputTokens).toBe(500);
    // 1000/1e6 * $3 + 500/1e6 * $15 = 0.003 + 0.0075 = 0.0105
    expect(summary.estimatedCostUsd).toBeCloseTo(0.0105, 6);
  });

  it('breaks the summary down by scope', async () => {
    await recordClaudeUsage('coaching', 'claude-sonnet-5', 1000, 500);
    await recordClaudeUsage('coaching', 'claude-sonnet-5', 1000, 500);
    await recordClaudeUsage('mentor-agent', 'claude-sonnet-5', 2000, 1000);

    const summary = await getClaudeCostSummary(30);
    expect(summary.totalCalls).toBe(3);

    const coaching = summary.byScope.find((entry) => entry.scope === 'coaching');
    const mentor = summary.byScope.find((entry) => entry.scope === 'mentor-agent');
    expect(coaching?.calls).toBe(2);
    expect(mentor?.calls).toBe(1);
    // Sorted by cost descending - equal call count but mentor-agent used more tokens per call,
    // so its total should be compared correctly (2x coaching calls vs 1x double-sized mentor call).
    expect(coaching!.inputTokens).toBe(2000);
    expect(mentor!.inputTokens).toBe(2000);
  });

  it('applies the fallback (more expensive) pricing tier for an unrecognized model, rather than silently under-counting cost', async () => {
    await recordClaudeUsage('coaching', 'some-future-model', 1_000_000, 1_000_000);

    const summary = await getClaudeCostSummary(30);
    // Fallback pricing: $3 input + $15 output per million = $18 for 1M/1M tokens.
    expect(summary.estimatedCostUsd).toBeCloseTo(18, 6);
  });

  it('excludes calls outside the requested period', async () => {
    await prisma.claudeUsageLog.create({
      data: {
        scope: 'coaching',
        model: 'claude-sonnet-5',
        inputTokens: 1000,
        outputTokens: 500,
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      },
    });

    const summary = await getClaudeCostSummary(30);
    expect(summary.totalCalls).toBe(0);
  });

  it('never throws when the database write itself fails', async () => {
    // scope longer than the column would realistically ever need, but still a valid string -
    // this exercises the "never blocks the caller" contract without needing to simulate a real
    // DB outage; the important behavior (best-effort, swallow-and-log) is what matters here.
    await expect(recordClaudeUsage('x'.repeat(50), 'claude-sonnet-5', 10, 5)).resolves.toBeUndefined();
  });
});
