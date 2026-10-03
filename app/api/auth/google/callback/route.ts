import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { issueAccessToken, issuePendingTwoFactorToken, TOKEN_COOKIE_NAME, TWO_FACTOR_REMEMBER_COOKIE_NAME, getSessionMaxAgeSec } from '@/lib/server/auth';
import { verifyTrustedDeviceToken } from '@/lib/server/two-factor';
import { deleteUserCompletely } from '@/lib/server/account-deletion';
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
    // Only a Google-verified address proves mailbox ownership (2026-10-03, security review).
    // tokeninfo (fallback path) returns it as the string "true".
    const emailVerified = profile.email_verified === true || String(profile.email_verified) === 'true';
    if (!email || !emailVerified) {
      throw new Error('Google profile does not provide a verified email');
    }

    const displayName = sanitizeName(profile.given_name ?? profile.name, email);

    const foundUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerifiedAt: true,
        twoFactorEnabled: true,
      },
    });

    // Pre-registration takeover guard (2026-10-03, security review): an account whose email was never
    // confirmed may have been created by someone else, who could still hold a valid session and have
    // attached their own social accounts. Google proves the mailbox owner, so that account is removed
    // completely and the owner starts with a fresh one.
    if (foundUser && !foundUser.emailVerifiedAt) {
      await deleteUserCompletely(foundUser.id);
    }
    const existingUser = foundUser?.emailVerifiedAt ? foundUser : null;

    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: existingUser.name?.trim() ? existingUser.name : displayName,
          },
          select: {
            id: true,
            email: true,
            twoFactorEnabled: true,
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
            twoFactorEnabled: true,
          },
        });

    // Google sign-in never skips 2FA (2026-10-03): same rule as the password login - a trusted
    // device cookie skips the code, otherwise /login continues with the code step.
    if (user.twoFactorEnabled) {
      const rememberToken = request.cookies.get(TWO_FACTOR_REMEMBER_COOKIE_NAME)?.value?.trim();
      const deviceTrusted = rememberToken ? await verifyTrustedDeviceToken(user.id, rememberToken) : false;
      if (!deviceTrusted) {
        const twoFactorRedirect = new URL('/login', frontendUrl);
        twoFactorRedirect.hash = `2fa=${encodeURIComponent(issuePendingTwoFactorToken(user.id, user.email))}`;
        const pendingResponse = NextResponse.redirect(twoFactorRedirect, 302);
        pendingResponse.cookies.set(GOOGLE_LOGIN_STATE_COOKIE, '', { path: GOOGLE_LOGIN_STATE_COOKIE_PATH, maxAge: 0 });
        return pendingResponse;
      }
    }

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
