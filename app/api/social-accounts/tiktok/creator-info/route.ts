import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, unauthorized } from '@/lib/server/http';
import { fetchTikTokCreatorInfo, TikTokCreatorCannotPostError } from '@/lib/server/tiktok-creator-info';

// `?socialAccountId=` (2026-09-30, TikTok audit rejection ref 20260913074631): the composer must
// show the creator info of the account the post will actually go to (guideline 1a - "display the
// creator's nickname, so users are aware of which TikTok account the content will be uploaded
// to"). Without it this used to pick the most recently updated TikTok account, which is the wrong
// one as soon as a user has two. Still optional for the media step's early duration hint.
export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const requestedAccountId = request.nextUrl.searchParams.get('socialAccountId');

    const account = await prisma.socialAccount.findFirst({
      where: {
        userId: user.userId,
        platform: 'TIKTOK',
        ...(requestedAccountId ? { id: requestedAccountId } : {}),
      },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        handle: true,
      },
    });

    if (!account) {
      return badRequest('Brak podłączonego konta TikTok');
    }

    try {
      const creatorInfo = await fetchTikTokCreatorInfo(account.id);
      return NextResponse.json({
        account,
        creatorInfo: creatorInfo ?? null,
        canPost: true,
        cannotPostReason: null,
      });
    } catch (error) {
      // Guideline 1b: "creator can not make more posts at this moment" is a normal, expected
      // state the UI must render (block publishing + "try again later"), not a request failure.
      if (error instanceof TikTokCreatorCannotPostError) {
        return NextResponse.json({
          account,
          creatorInfo: null,
          canPost: false,
          cannotPostReason: error.userMessage,
        });
      }
      throw error;
    }
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
