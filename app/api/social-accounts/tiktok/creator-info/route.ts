import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { decryptToken, refreshSocialAccessToken } from '@/lib/server/social-oauth';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);

    const account = await prisma.socialAccount.findFirst({
      where: {
        userId: user.userId,
        platform: 'TIKTOK',
      },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        accessToken: true,
        expiresAt: true,
      },
    });

    if (!account) {
      return badRequest('Brak podłączonego konta TikTok');
    }

    let accessToken = decryptToken(account.accessToken);
    if (!accessToken || (account.expiresAt && account.expiresAt.getTime() <= Date.now() + 30_000)) {
      const refreshed = await refreshSocialAccessToken(account.id);
      accessToken = refreshed.accessToken;
    }

    if (!accessToken) {
      return badRequest('Brak aktywnego tokenu TikTok');
    }

    const response = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return badRequest(`TikTok creator_info error: ${errorBody || response.statusText}`);
    }

    const payload = (await response.json()) as {
      data?: {
        creator_nickname?: string;
        privacy_level_options?: string[];
        comment_disabled?: boolean;
        duet_disabled?: boolean;
        stitch_disabled?: boolean;
        max_video_post_duration_sec?: number;
      };
    };

    return NextResponse.json({
      creatorInfo: payload.data ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
