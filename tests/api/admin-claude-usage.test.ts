import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/claude-usage/route';
import { recordClaudeUsage } from '@/lib/server/claude-usage';

// EPIC 8 TASK-8.3 - protected by middleware.ts at the network edge (/api/admin/:path*), so this
// route itself doesn't re-check auth, same pattern as the pre-existing /api/admin/jobs.
//
// ClaudeUsageLog is a global table shared across parallel test files (see the comment in
// tests/unit/claude-usage.test.ts) - assertions here use a unique scope per test rather than the
// response's global totals, which other concurrently-running tests can also add rows to.

function uniqueScope(label: string) {
  return `test-admin-${label}-${randomUUID()}`;
}

describe('GET /api/admin/claude-usage', () => {
  it('returns 200 with the expected shape when nothing has been recorded for a fresh scope', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/admin/claude-usage'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.periodDays).toBe(30);
    expect(Array.isArray(body.byScope)).toBe(true);
  });

  it('reflects recorded usage for a specific scope', async () => {
    const scope = uniqueScope('reflects-usage');
    await recordClaudeUsage(scope, 'claude-sonnet-5', 1000, 500);

    const response = await GET(new NextRequest('http://localhost:3000/api/admin/claude-usage'));
    const body = await response.json();
    expect(body.byScope).toEqual(expect.arrayContaining([expect.objectContaining({ scope, calls: 1 })]));
  });

  it('respects a custom ?days= period', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/admin/claude-usage?days=7'));
    const body = await response.json();
    expect(body.periodDays).toBe(7);
  });
});
