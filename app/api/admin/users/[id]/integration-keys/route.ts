// Admin: create an integration key FOR a customer's account (2026-09-25) - the operator wires up
// the customer's website (e.g. the agency's blog/CRM) without logging into the customer's account.
// The key still belongs to the customer (visible and revocable in their own /account). Plaintext
// is returned once, same as the self-service endpoint.
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { isAdminEmail } from '@/lib/server/admin';
import { badRequest, notFound, serverError, unauthorized } from '@/lib/server/http';
import { prisma } from '@/lib/server/prisma';
import {
  createIntegrationKey,
  INTEGRATION_KEY_NAME_MAX_LENGTH,
  MAX_ACTIVE_KEYS_PER_USER,
} from '@/lib/server/integration-keys';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!isAdminEmail(getAuthUserFromRequest(request).email)) return unauthorized();
  } catch {
    return unauthorized();
  }

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Strona www';
    if (name.length > INTEGRATION_KEY_NAME_MAX_LENGTH) {
      return badRequest(`name: do ${INTEGRATION_KEY_NAME_MAX_LENGTH} znaków`);
    }

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) return notFound('Nie znaleziono konta.');

    const activeCount = await prisma.integrationKey.count({ where: { userId: id, revokedAt: null } });
    if (activeCount >= MAX_ACTIVE_KEYS_PER_USER) {
      return badRequest(`Konto ma już ${MAX_ACTIVE_KEYS_PER_USER} aktywnych kluczy.`);
    }

    const { key, plaintext } = await createIntegrationKey(id, name);
    return NextResponse.json({ key, plaintext }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
