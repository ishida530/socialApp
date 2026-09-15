import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { serverError, unauthorized } from '@/lib/server/http';
import { startTwoFactorSetup } from '@/lib/server/two-factor';

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const result = await startTwoFactorSetup(user.userId, user.email);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
