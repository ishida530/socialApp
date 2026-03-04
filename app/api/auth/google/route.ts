import { NextRequest, NextResponse } from 'next/server';
import { badRequest, serverError } from '@/lib/server/http';
import { buildGoogleLoginUrl, createGoogleLoginState } from '@/lib/server/google-auth';

const GOOGLE_LOGIN_STATE_COOKIE = 'google_login_state';
const GOOGLE_LOGIN_STATE_COOKIE_PATH = '/api/auth/google/callback';

export async function GET(_request: NextRequest) {
  try {
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
