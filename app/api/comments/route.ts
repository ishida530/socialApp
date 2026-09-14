import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { serverError, unauthorized } from '@/lib/server/http';
import { prisma } from '@/lib/server/prisma';

// Web equivalent of the Telegram detected-comment alerts (EPIC 11 Sprint 11.2) - lists PENDING
// SocialComment rows so the owner can act on the web dashboard too, not just via the Telegram
// buttons. Mutations (accept/reply/ignore) are in app/api/comments/[id]/route.ts, reusing the
// exact same lib/server/social-comments.ts functions as the Telegram callback handlers.
export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const comments = await prisma.socialComment.findMany({
      where: { userId: user.userId, status: 'PENDING' },
      orderBy: { detectedAt: 'desc' },
      take: 50,
      include: { publishJob: { select: { socialAccount: { select: { platform: true } }, remotePostUrl: true } } },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
