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
    const modeParam = request.nextUrl.searchParams.get('mode');
    const tikTokScopeMode = modeParam === 'publish' ? 'publish' : 'connect';

    const result = buildAuthUrl(platform, user.userId, {
      tikTokScopeMode,
    });
    const response = NextResponse.json({
      success: true,
      accountId: account.id,
      platform,
      tikTokScopeMode,
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

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    if (
      error instanceof Error &&
      (error.message.startsWith('Missing required config') ||
        error.message.startsWith('Missing required config.') ||
        error.message === 'Unsupported platform. Use youtube or tiktok.')
    ) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}