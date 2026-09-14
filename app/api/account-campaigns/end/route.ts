import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { endActiveCampaign } from '@/lib/server/campaigns';

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const ended = await endActiveCampaign(user.userId);

    if (!ended) {
      return badRequest('Brak aktywnej kampanii do zakończenia.');
    }

    return NextResponse.json({ ended });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
