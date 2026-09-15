import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/claude-usage/route';
import { prisma } from '@/lib/server/prisma';
import { recordClaudeUsage } from '@/lib/server/claude-usage';

// EPIC 8 TASK-8.3 - protected by middleware.ts at the network edge (/api/admin/:path*), so this
// route itself doesn't re-check auth, same pattern as the pre-existing /api/admin/jobs.

afterEach(async () => {
  await prisma.claudeUsageLog.deleteMany();
});

describe('GET /api/admin/claude-usage', () => {
  it('returns an empty summary with no usage recorded', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/admin/claude-usage'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totalCalls).toBe(0);
    expect(body.periodDays).toBe(30);
  });

  it('reflects recorded usage', async () => {
    await recordClaudeUsage('coaching', 'claude-sonnet-5', 1000, 500);

    const response = await GET(new NextRequest('http://localhost:3000/api/admin/claude-usage'));
    const body = await response.json();
    expect(body.totalCalls).toBe(1);
    expect(body.byScope).toEqual([expect.objectContaining({ scope: 'coaching', calls: 1 })]);
  });

  it('respects a custom ?days= period', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/admin/claude-usage?days=7'));
    const body = await response.json();
    expect(body.periodDays).toBe(7);
  });
});
