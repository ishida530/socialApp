// DELETE: revoke one of the caller's integration keys. Soft revoke (revokedAt) rather than delete,
// so a leaked key's past usage (lastUsedAt) stays inspectable.
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { notFound, serverError, unauthorized } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = getAuthUserFromRequest(request).userId;
  } catch {
    return unauthorized();
  }

  try {
    const { id } = await context.params;
    const result = await prisma.integrationKey.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      return notFound('Nie znaleziono klucza.');
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
