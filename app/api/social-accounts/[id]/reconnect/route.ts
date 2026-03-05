import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import {
  buildAuthUrl,
  encodePkcePayload,
} from '@/lib/server/social-oauth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';

const TIKTOK_PKCE_COOKIE = 'tiktok_pkce';
const TIKTOK_PKCE_COOKIE_PATH = '/api/auth/callback/tiktok';
const OAUTH_RECONNECT_ACCOUNT_COOKIE = 'oauth_reconnect_account_id';
const OAUTH_RECONNECT_ACCOUNT_COOKIE_PATH = '/api/auth/callback';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = getAuthUserFromRequest(request);
    const params = await context.params;

    const account = await prisma.socialAccount.findFirst({
      where: {
        id: params.id,
        userId: user.userId,
      },
      select: {
        id: true,
        platform: true,
      },
    });

    if (!account) {
      return badRequest('Nie znaleziono konta społecznościowego użytkownika');
    }

    const platform = account.platform.toLowerCase();
    const result = buildAuthUrl(platform, user.userId);
    const response = NextResponse.json({
      success: true,
      accountId: account.id,
      platform,
      url: result.url,
    });

    if (platform === 'tiktok' && result.tiktokPkce) {
      const payload = encodePkcePayload(result.tiktokPkce);
      response.cookies.set(TIKTOK_PKCE_COOKIE, payload, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 10 * 60,
        path: TIKTOK_PKCE_COOKIE_PATH,
      });
    }

    response.cookies.set(OAUTH_RECONNECT_ACCOUNT_COOKIE, account.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60,
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
        error.message.startsWith('Missing required config.') ||
        error.message.startsWith('Unsupported platform.'))
    ) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}