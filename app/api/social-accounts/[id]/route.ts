import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { revokeSocialAccountGrant } from '@/lib/server/social-oauth';

export async function DELETE(
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
      select: { id: true, platform: true, accessToken: true, refreshToken: true },
    });

    if (!account) {
      return badRequest('Nie znaleziono konta społecznościowego użytkownika');
    }

    await revokeSocialAccountGrant(account);
    // Cascades to the account's publish jobs, post metrics and growth snapshots - all API data
    // obtained through this grant is deleted right away (YouTube policy: within 7 days).
    await prisma.socialAccount.delete({ where: { id: account.id } });

    return NextResponse.json({ success: true, id: account.id });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}