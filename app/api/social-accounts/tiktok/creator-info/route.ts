import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
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

    if (error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}
