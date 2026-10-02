import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { issueAccessToken, TOKEN_COOKIE_NAME, getSessionMaxAgeSec } from '@/lib/server/auth';
import {
  exchangeGoogleCodeForLogin,
  fetchGoogleUserInfo,
  verifyGoogleLoginState,
} from '@/lib/server/google-auth';

const GOOGLE_LOGIN_STATE_COOKIE = 'google_login_state';
const GOOGLE_LOGIN_STATE_COOKIE_PATH = '/api/auth/google/callback';


function resolveFrontendUrl() {
  return process.env.FRONTEND_URL ?? 'http://localhost:3000';
}

function sanitizeName(rawName?: string, fallbackEmail?: string) {
  const trimmed = rawName?.trim();
  if (trimmed) {
    return trimmed;
  }

  const fromEmail = fallbackEmail?.split('@')[0]?.trim();
  if (fromEmail) {
    return fromEmail;
  }

  return 'Użytkownik Postfly';
}

export async function GET(request: NextRequest) {
  const frontendUrl = resolveFrontendUrl();
  const successRedirect = new URL('/dashboard', frontendUrl);
  const errorRedirect = new URL('/login', frontendUrl);

  try {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const cookieState = request.cookies.get(GOOGLE_LOGIN_STATE_COOKIE)?.value;

    if (!code || !state || !cookieState || cookieState !== state) {
      throw new Error('Invalid Google OAuth callback payload');
    }

    verifyGoogleLoginState(state);

    const token = await exchangeGoogleCodeForLogin(code);
    const profile = await fetchGoogleUserInfo(token.access_token, token.id_token);

    const email = profile.email?.trim().toLowerCase();
    if (!email) {
      throw new Error('Google profile does not provide an email');
    }

    const displayName = sanitizeName(profile.given_name ?? profile.name, email);

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerifiedAt: true,
      },
    });

    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: existingUser.name?.trim() ? existingUser.name : displayName,
            // Google only issues verified addresses for sign-in - proof of mailbox ownership.
            emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
          },
          select: {
            id: true,
            email: true,
          },
        })
      : await prisma.user.create({
          data: {
            email,
            name: displayName,
            passwordHash: null,
            emailVerifiedAt: new Date(),
          },
          select: {
            id: true,
            email: true,
          },
        });

    const accessToken = issueAccessToken(user.id, user.email);
    const response = NextResponse.redirect(successRedirect, 302);
    response.cookies.set(TOKEN_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: getSessionMaxAgeSec(),
    });

    response.cookies.set(GOOGLE_LOGIN_STATE_COOKIE, '', {
      path: GOOGLE_LOGIN_STATE_COOKIE_PATH,
      maxAge: 0,
    });

    return response;
  } catch {
    errorRedirect.searchParams.set('error', 'google_oauth_failed');

    const response = NextResponse.redirect(errorRedirect, 302);
    response.cookies.set(GOOGLE_LOGIN_STATE_COOKIE, '', {
      path: GOOGLE_LOGIN_STATE_COOKIE_PATH,
      maxAge: 0,
    });

    return response;
  }
}
