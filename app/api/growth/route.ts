import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { serverError, unauthorized } from '@/lib/server/http';
import { getFollowerGrowth } from '@/lib/server/account-growth';

// Web equivalent of the Telegram /followers command.
export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const growth = await getFollowerGrowth(user.userId);
    return NextResponse.json({ growth });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
