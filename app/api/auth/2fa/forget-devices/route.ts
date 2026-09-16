import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { serverError, unauthorized } from '@/lib/server/http';
import { forgetAllTrustedDevices } from '@/lib/server/two-factor';

// "Remember this device" (2026-09-16) - lets a user revoke every remembered device at once
// (e.g. accidentally trusted a shared/public computer), independent of enabling/disabling 2FA.
export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const result = await forgetAllTrustedDevices(user.userId);
    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
