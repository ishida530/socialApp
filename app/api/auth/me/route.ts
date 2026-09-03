import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, unauthorized } from '@/lib/server/http';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    return NextResponse.json({ user });
  } catch {
    return unauthorized();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json()) as { defaultExplicitContent?: boolean };

    if (typeof body.defaultExplicitContent !== 'boolean') {
      return badRequest('Validation failed', ['defaultExplicitContent: wymagana wartość boolean']);
    }

    const updated = await prisma.user.update({
      where: { id: user.userId },
      data: { defaultExplicitContent: body.defaultExplicitContent },
      select: { id: true, defaultExplicitContent: true },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return badRequest('Nie udało się zapisać ustawienia.');
  }
}
