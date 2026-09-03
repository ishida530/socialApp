import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import {
  buildAuthUrl,
  encodePkcePayload,
} from '@/lib/server/social-oauth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';

const TIKTOK_PKCE_COOKIE = 'tiktok_pkce';
const TIKTOK_PKCE_COOKIE_PATH = '/api/auth/callback/tiktok';
const OAUTH_RECONNECT_ACCOUNT_COOKIE = 'oauth_reconnect_account_id';
const OAUTH_RECONNECT_ACCOUNT_COOKIE_PATH = '/api/auth/callback';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string }> },
) {
  try {
    const params = await context.params;
    const user = getAuthUserFromRequest(request);
    const result = buildAuthUrl(params.platform, user.userId);
    const debugEnabled = request.nextUrl.searchParams.get('debug') === '1';
    const authUrl = new URL(result.url);
    const scopeRaw = authUrl.searchParams.get('scope') ?? '';

    const response = NextResponse.json(
      debugEnabled
        ? {
            url: result.url,
            debug: {
              platform: params.platform,
              scopeRaw,
              scopes: scopeRaw
                .split(/[\s,]+/)
                .map((entry) => entry.trim())
                .filter(Boolean),
            },
          }
        : { url: result.url },
    );

    if (
      params.platform.toLowerCase() === 'tiktok' &&
      result.tiktokPkce
    ) {
      const payload = encodePkcePayload(result.tiktokPkce);
      response.cookies.set(TIKTOK_PKCE_COOKIE, payload, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 10 * 60,
        path: TIKTOK_PKCE_COOKIE_PATH,
      });
    }

    // Starting a fresh "connect another account" flow must not reuse reconnect intent.
    response.cookies.set(OAUTH_RECONNECT_ACCOUNT_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0,
      path: OAUTH_RECONNECT_ACCOUNT_COOKIE_PATH,
    });

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    if (
      error instanceof Error &&
      (error.message.startsWith('Missing required config') ||
        error.message.startsWith('Unsupported platform.'))
    ) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}
