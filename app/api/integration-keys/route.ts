// GET: list the caller's active integration keys (never the plaintext). POST: create a new key -
// the plaintext is in this response only; the UI must tell the user to copy it now.
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import {
  createIntegrationKey,
  INTEGRATION_KEY_NAME_MAX_LENGTH,
  MAX_ACTIVE_KEYS_PER_USER,
} from '@/lib/server/integration-keys';

export const dynamic = 'force-dynamic';

function requireUser(request: NextRequest) {
  try {
    return getAuthUserFromRequest(request);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const user = requireUser(request);
  if (!user) return unauthorized();

  try {
    const keys = await prisma.integrationKey.findMany({
      where: { userId: user.userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true },
    });
    return NextResponse.json({ keys });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  const user = requireUser(request);
  if (!user) return unauthorized();

  try {
    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > INTEGRATION_KEY_NAME_MAX_LENGTH) {
      return badRequest('Validation failed', [`name: wymagana nazwa do ${INTEGRATION_KEY_NAME_MAX_LENGTH} znaków`]);
    }

    const activeCount = await prisma.integrationKey.count({ where: { userId: user.userId, revokedAt: null } });
    if (activeCount >= MAX_ACTIVE_KEYS_PER_USER) {
      return badRequest(`Możesz mieć maksymalnie ${MAX_ACTIVE_KEYS_PER_USER} aktywnych kluczy. Usuń nieużywany.`);
    }

    const { key, plaintext } = await createIntegrationKey(user.userId, name);
    return NextResponse.json({ key, plaintext }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
