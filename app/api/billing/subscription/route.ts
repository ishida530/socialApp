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

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003' || error.code === 'P2025') {
        return unauthorized();
      }
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

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003' || error.code === 'P2025') {
        return unauthorized();
      }
      return badRequest('Zmiana planu nie powiodła się.');
    }

    return serverError(error);
  }
}
