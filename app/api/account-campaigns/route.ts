import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { getActiveCampaign, listRecentCampaigns, startCampaign } from '@/lib/server/campaigns';

// Web equivalent of the Telegram /campaign, /campaign-end, /campaigns commands - same
// lib/server/campaigns.ts functions, so behavior (auto-ending the previous active campaign, zero
// extra step per upload once one is active) is identical regardless of which channel is used.
// Deliberately a distinct route namespace from the pre-existing app/api/campaigns/* (weekly
// content-planning suggestions, operating on Video/PublishJob - an unrelated older feature that
// never touched the Campaign Prisma model) to avoid conflating the two.
export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);

    const [active, recent] = await Promise.all([
      getActiveCampaign(user.userId),
      listRecentCampaigns(user.userId, 10),
    ]);

    return NextResponse.json({ active, campaigns: recent });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const name = body.name?.trim();

    if (!name) {
      return badRequest('Validation failed', ['name: wymagana nazwa kampanii']);
    }

    const result = await startCampaign(user.userId, name);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
