import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, unauthorized } from '@/lib/server/http';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    // businessDescription isn't part of the JWT payload (AuthUser stays minimal/unchanged -
    // it's used broadly via the auth context) - one extra lookup, returned alongside instead of
    // reshaping `user`.
    const profile = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { businessDescription: true },
    });
    return NextResponse.json({ user, businessDescription: profile?.businessDescription ?? null });
  } catch {
    return unauthorized();
  }
}

const BUSINESS_DESCRIPTION_MAX_LENGTH = 500;

export async function PATCH(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json()) as {
      defaultExplicitContent?: boolean;
      businessDescription?: string;
    };

    const data: { defaultExplicitContent?: boolean; businessDescription?: string | null } = {};

    if (body.defaultExplicitContent !== undefined) {
      if (typeof body.defaultExplicitContent !== 'boolean') {
        return badRequest('Validation failed', ['defaultExplicitContent: wymagana wartość boolean']);
      }
      data.defaultExplicitContent = body.defaultExplicitContent;
    }

    if (body.businessDescription !== undefined) {
      if (typeof body.businessDescription !== 'string') {
        return badRequest('Validation failed', ['businessDescription: wymagany tekst']);
      }
      const trimmed = body.businessDescription.trim();
      if (trimmed.length > BUSINESS_DESCRIPTION_MAX_LENGTH) {
        return badRequest('Validation failed', [
          `businessDescription: maksymalnie ${BUSINESS_DESCRIPTION_MAX_LENGTH} znaków`,
        ]);
      }
      // Empty string clears it back to null (Prisma treats `undefined` as "leave untouched",
      // not "clear it" - null is required to actually null the column out).
      data.businessDescription = trimmed || null;
    }

    if (Object.keys(data).length === 0) {
      return badRequest('Validation failed', ['Brak pól do zapisania']);
    }

    const updated = await prisma.user.update({
      where: { id: user.userId },
      data,
      select: { id: true, defaultExplicitContent: true, businessDescription: true },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return badRequest('Nie udało się zapisać ustawienia.');
  }
}
