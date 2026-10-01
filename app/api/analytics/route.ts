import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { serverError, unauthorized } from '@/lib/server/http';
import { getAnalyticsSummary, resolveAnalyticsRange } from '@/lib/server/dashboard-data';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const range = resolveAnalyticsRange(request.nextUrl.searchParams.get('range'));

    return NextResponse.json(await getAnalyticsSummary(user.userId, range));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
