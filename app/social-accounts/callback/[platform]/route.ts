import { NextRequest, NextResponse } from 'next/server';
import {
  decodePkcePayload,
  getFrontendUrl,
  handleOAuthCallback,
  OAuthCallbackQuery,
} from '@/lib/server/social-oauth';

const TIKTOK_PKCE_COOKIE = 'tiktok_pkce';
const TIKTOK_PKCE_COOKIE_PATH = '/social-accounts/callback/tiktok';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string }> },
) {
  const params = await context.params;
  const frontendUrl = getFrontendUrl();
  const redirectUrl = new URL('/callback', frontendUrl);
  const normalizedPlatform = params.platform.toLowerCase();
  const isTikTok = normalizedPlatform === 'tiktok';
  redirectUrl.searchParams.set('platform', normalizedPlatform);

  try {
    const query = Object.fromEntries(request.nextUrl.searchParams) as OAuthCallbackQuery;

    let tiktokCodeVerifier: string | undefined;
    if (isTikTok) {
      const state = query.state;
      if (!state) {
        throw new Error('Missing OAuth state for TikTok callback');
      }

      const cookiePayload = request.cookies.get(TIKTOK_PKCE_COOKIE)?.value;
      if (!cookiePayload) {
        throw new Error('Missing TikTok PKCE cookie');
      }

      const parsed = decodePkcePayload(cookiePayload);
      if (parsed.state !== state) {
        throw new Error('TikTok PKCE state mismatch');
      }

      tiktokCodeVerifier = parsed.codeVerifier;
    }

    const result = await handleOAuthCallback(params.platform, query, {
      tiktokCodeVerifier,
    });

    redirectUrl.searchParams.set('status', 'success');
    redirectUrl.searchParams.set(
      'message',
      result.message ?? 'Konto zostało połączone.',
    );

    const response = NextResponse.redirect(redirectUrl, 302);
    if (isTikTok) {
      response.cookies.set(TIKTOK_PKCE_COOKIE, '', {
        path: TIKTOK_PKCE_COOKIE_PATH,
        maxAge: 0,
      });
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth callback failed';
    redirectUrl.searchParams.set('status', 'error');
    redirectUrl.searchParams.set('message', message);

    const response = NextResponse.redirect(redirectUrl, 302);
    if (isTikTok) {
      response.cookies.set(TIKTOK_PKCE_COOKIE, '', {
        path: TIKTOK_PKCE_COOKIE_PATH,
        maxAge: 0,
      });
    }

    return response;
  }
}
