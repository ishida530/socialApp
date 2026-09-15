import { NextRequest, NextResponse } from 'next/server';
import { serverError } from '@/lib/server/http';
import { getClaudeCostSummary } from '@/lib/server/claude-usage';

// EPIC 8 TASK-8.3 (Agent kosztow/FinOps) - protected by middleware.ts's path-based admin check
// (/api/admin/:path*), same as every other route under this prefix - no separate auth check
// needed here.
export async function GET(request: NextRequest) {
  try {
    const daysParam = Number(request.nextUrl.searchParams.get('days'));
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(Math.trunc(daysParam), 365) : 30;

    const summary = await getClaudeCostSummary(days);
    return NextResponse.json(summary);
  } catch (error) {
    return serverError(error);
  }
}
