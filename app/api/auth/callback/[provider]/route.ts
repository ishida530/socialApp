import { after, NextRequest, NextResponse } from 'next/server';
import { snapshotSocialAccountGrowth } from '@/lib/server/account-growth';
import {
  decodePkcePayload,
  getFrontendUrl,
  handleOAuthCallback,
  OAuthCallbackQuery,
  OAuthUserFacingError,
} from '@/lib/server/social-oauth';
import { logError, logEvent } from '@/lib/server/observability';

const TIKTOK_PKCE_COOKIE = 'tiktok_pkce';
const TIKTOK_PKCE_COOKIE_PATH = '/api/auth/callback/tiktok';
const OAUTH_RECONNECT_ACCOUNT_COOKIE = 'oauth_reconnect_account_id';
const OAUTH_RECONNECT_ACCOUNT_COOKIE_PATH = '/api/auth/callback';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const params = await context.params;
  const frontendUrl = getFrontendUrl();
  const redirectUrl = new URL('/callback', frontendUrl);
  const normalizedProvider = params.provider.toLowerCase();
  const isTikTok = normalizedProvider === 'tiktok';
  redirectUrl.searchParams.set('platform', normalizedProvider);

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
        // Expired (10 min) or the flow was started on a different domain than the redirect URI
        // (e.g. *.vercel.app vs the custom domain) - the cookie is host-bound.
        throw new OAuthUserFacingError(
          'Sesja łączenia TikToka wygasła. Kliknij „Połącz” ponownie i dokończ logowanie w ciągu kilku minut.',
        );
      }

      const parsed = decodePkcePayload(cookiePayload);
      if (parsed.state !== state) {
        throw new Error('TikTok PKCE state mismatch');
      }

      tiktokCodeVerifier = parsed.codeVerifier;
    }

    const result = await handleOAuthCallback(normalizedProvider, query, {
      tiktokCodeVerifier,
      reconnectAccountId: request.cookies.get(OAUTH_RECONNECT_ACCOUNT_COOKIE)?.value,
    });

    logEvent('oauth-callback', 'success', {
      provider: normalizedProvider,
      accountId: result.accountId,
    });

    // First follower-count data point right after connecting (2026-10-04), after the redirect is
    // sent - the Growth screen is not empty until the next daily sweep. Best-effort.
    if (result.accountId) {
      const accountId = result.accountId;
      after(() => snapshotSocialAccountGrowth(accountId).catch(() => false));
    }

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
    response.cookies.set(OAUTH_RECONNECT_ACCOUNT_COOKIE, '', {
      path: OAUTH_RECONNECT_ACCOUNT_COOKIE_PATH,
      maxAge: 0,
    });

    return response;
  } catch (error) {
    logError('oauth-callback', 'failure', error, {
      provider: normalizedProvider,
    });
    // The real error (raw social-oauth/TikTok/Google API text, incl. token/crypto
    // details) is logged above — it must not leak into a URL the browser displays.
    redirectUrl.searchParams.set('status', 'error');
    // OAuthUserFacingError messages are written for the user and carry nothing sensitive - they're
    // the actionable ones (cancelled consent, no IG Business account, plan limit...).
    redirectUrl.searchParams.set(
      'message',
      error instanceof OAuthUserFacingError ? error.message : 'Nie udało się połączyć konta. Spróbuj ponownie.',
    );

    const response = NextResponse.redirect(redirectUrl, 302);
    if (isTikTok) {
      response.cookies.set(TIKTOK_PKCE_COOKIE, '', {
        path: TIKTOK_PKCE_COOKIE_PATH,
        maxAge: 0,
      });
    }
    response.cookies.set(OAUTH_RECONNECT_ACCOUNT_COOKIE, '', {
      path: OAUTH_RECONNECT_ACCOUNT_COOKIE_PATH,
      maxAge: 0,
    });

    return response;
  }
}
