import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';

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
      select: { id: true },
    });

    if (!account) {
      return badRequest('Nie znaleziono konta społecznościowego użytkownika');
    }

    await prisma.socialAccount.delete({ where: { id: account.id } });

    return NextResponse.json({ success: true, id: account.id });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}