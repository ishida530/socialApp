import { NextRequest, NextResponse } from 'next/server';
import { badRequest, serverError, tooManyRequests } from '@/lib/server/http';
import { consumeRateLimit, getRequestIp } from '@/lib/server/rate-limit';
import { buildGoogleLoginUrl, createGoogleLoginState } from '@/lib/server/google-auth';

const GOOGLE_LOGIN_STATE_COOKIE = 'google_login_state';
const GOOGLE_LOGIN_STATE_COOKIE_PATH = '/api/auth/google/callback';

export async function GET(request: NextRequest) {
  try {
    const rateLimit = await consumeRateLimit({
      key: `auth:google:${getRequestIp(request)}`,
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return tooManyRequests('Too many requests. Try again later.', rateLimit.retryAfterSec);
    }

    const state = createGoogleLoginState();
    const authUrl = buildGoogleLoginUrl(state);

    const response = NextResponse.redirect(authUrl, 302);
    response.cookies.set(GOOGLE_LOGIN_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60,
      path: GOOGLE_LOGIN_STATE_COOKIE_PATH,
    });

    return response;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Missing required config:')) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}
