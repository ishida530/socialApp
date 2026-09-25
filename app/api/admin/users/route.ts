// Admin: list accounts and create (or re-invite) a customer account - see lib/server/account-invites.ts.
// Protected by middleware.ts's /api/admin/:path* check like every route here; creating accounts is
// sensitive enough to re-check the admin email in the handler too (defense in depth).
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { isAdminEmail } from '@/lib/server/admin';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { prisma } from '@/lib/server/prisma';
import { inviteAccount } from '@/lib/server/account-invites';

export const dynamic = 'force-dynamic';

function isAdminRequest(request: NextRequest): boolean {
  try {
    return isAdminEmail(getAuthUserFromRequest(request).email);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorized();
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        passwordHash: true,
        _count: { select: { socialAccounts: true } },
      },
    });
    return NextResponse.json({
      users: users.map(({ passwordHash, _count, ...user }) => ({
        ...user,
        hasPassword: Boolean(passwordHash),
        socialAccountCount: _count.socialAccounts,
      })),
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorized();
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: unknown; name?: unknown };
    if (typeof body.email !== 'string' || typeof body.name !== 'string') {
      return badRequest('Validation failed', ['email i name: wymagane teksty']);
    }
    const result = await inviteAccount({ email: body.email, name: body.name });
    if (!result.ok) {
      return badRequest(result.error);
    }
    return NextResponse.json(result, { status: result.status === 'created' ? 201 : 200 });
  } catch (error) {
    return serverError(error);
  }
}
