import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { disableTwoFactor } from '@/lib/server/two-factor';

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json().catch(() => ({}))) as { password?: string; code?: string };

    if (!body.password || !body.code) {
      return badRequest('Validation failed', ['password i code są wymagane']);
    }

    const result = await disableTwoFactor(user.userId, body.password, body.code);
    if (!result.ok) {
      return badRequest(result.error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
