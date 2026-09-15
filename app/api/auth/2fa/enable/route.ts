import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { enableTwoFactor } from '@/lib/server/two-factor';

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json().catch(() => ({}))) as { code?: string };

    if (!body.code) {
      return badRequest('Validation failed', ['code: wymagany kod z aplikacji uwierzytelniającej']);
    }

    const result = await enableTwoFactor(user.userId, body.code);
    if (!result.ok) {
      return badRequest(result.error);
    }

    return NextResponse.json({ backupCodes: result.backupCodes });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
