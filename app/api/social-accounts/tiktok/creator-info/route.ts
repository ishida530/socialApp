import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, unauthorized } from '@/lib/server/http';
import { fetchTikTokCreatorInfo } from '@/lib/server/tiktok-creator-info';

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
      },
    });

    if (!account) {
      return badRequest('Brak podłączonego konta TikTok');
    }

    const creatorInfo = await fetchTikTokCreatorInfo(account.id);

    return NextResponse.json({
      creatorInfo: creatorInfo ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    // Anything unexpected here (token decryption, TikTok API, refresh failures) is an
    // internal detail — surfacing it verbatim leaked things like raw crypto error text
    // ("Invalid encrypted payload format") straight into the composer UI. Log the real
    // error server-side and give the user a message they can actually act on.
    console.error('[tiktok/creator-info] failed to load creator info', error);
    return badRequest('Nie udało się pobrać ustawień konta TikTok. Spróbuj ponownie później.');
  }
}
