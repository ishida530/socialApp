import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { addFan, getFanCount, getRecentFans, isValidEmail } from '@/lib/server/monetization';

// Web equivalent of the Telegram /fan, /fans commands.
export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const [count, fans] = await Promise.all([getFanCount(user.userId), getRecentFans(user.userId, 20)]);
    return NextResponse.json({ count, fans });
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
    const body = (await request.json().catch(() => ({}))) as { email?: string; name?: string };
    const email = body.email?.trim();

    if (!email || !isValidEmail(email)) {
      return badRequest('Validation failed', ['email: wymagany prawidłowy adres email']);
    }

    const fan = await addFan(user.userId, email, body.name);
    return NextResponse.json({ fan });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
