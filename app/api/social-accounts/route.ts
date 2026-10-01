import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { serverError, unauthorized } from '@/lib/server/http';
import { PUBLIC_SOCIAL_ACCOUNT_SELECT } from '@/lib/server/public-fields';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const accounts = await prisma.socialAccount.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      select: PUBLIC_SOCIAL_ACCOUNT_SELECT,
    });

    return NextResponse.json(accounts);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
