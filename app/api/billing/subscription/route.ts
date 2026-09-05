import { NextRequest, NextResponse } from 'next/server';
import { PlanTier, Prisma } from '@prisma/client';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { getSubscriptionSnapshot, setUserPlan } from '@/lib/server/subscription';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const snapshot = await getSubscriptionSnapshot(user.userId);

    return NextResponse.json(snapshot);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('PlanTier_old') ||
        (error.message.includes('PlanTier') && error.message.includes('is of type')))
    ) {
      return badRequest('Baza danych wymaga migracji billingu (PlanTier). Uruchom prisma migrate deploy na produkcji.');
    }

    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    // P2003 (FK violation) / P2025 (record not found) included deliberately: neither is a
    // session problem (e.g. a race between two concurrent writes to the same subscription
    // row can hit a user whose JWT is completely valid) — returning 401 here would make the
    // client's global axios interceptor (lib/api-client.ts) misread it as "session expired"
    // and hard-redirect to /login. Same failure mode already fixed once in DELETE /api/account.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return badRequest('Nie udało się pobrać danych subskrypcji.');
    }

    return serverError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json()) as { plan?: string };

    if (!body.plan) {
      return badRequest('Validation failed', ['plan: Plan jest wymagany']);
    }

    const normalizedPlan = body.plan.toUpperCase();
    if (normalizedPlan !== 'FREE') {
      return badRequest('Bezpośrednia zmiana planu wspiera tylko FREE. Użyj checkout dla STARTER/PRO/BUSINESS.');
    }

    const subscription = await setUserPlan(user.userId, PlanTier.FREE);

    return NextResponse.json({ success: true, subscription });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('PlanTier_old') ||
        (error.message.includes('PlanTier') && error.message.includes('is of type')))
    ) {
      return badRequest('Baza danych wymaga migracji billingu (PlanTier). Uruchom prisma migrate deploy na produkcji.');
    }

    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    // P2003/P2025 handled the same way as GET above: not a session problem, so must not
    // return 401 (the client's global axios interceptor treats any non-/auth/me 401 as
    // "session expired" and hard-redirects to /login).
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return badRequest('Zmiana planu nie powiodła się.');
    }

    return serverError(error);
  }
}
