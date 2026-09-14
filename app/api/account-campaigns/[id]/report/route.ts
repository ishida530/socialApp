import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { notFound, serverError, unauthorized } from '@/lib/server/http';
import { getCampaignReport } from '@/lib/server/campaigns';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getAuthUserFromRequest(request);
    const params = await context.params;
    const result = await getCampaignReport(user.userId, params.id);

    if (!result.ok) {
      return notFound(result.error);
    }

    return NextResponse.json({ report: result.report });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
