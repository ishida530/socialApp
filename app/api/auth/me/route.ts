import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, unauthorized } from '@/lib/server/http';
import {
  BRAND_HASHTAG_MAX_LENGTH,
  normalizeBrandHashtag,
  parsePlatformStyleGuidesInput,
  readPlatformStyleGuides,
  type PlatformStyleGuides,
} from '@/lib/server/platform-style-guides';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    // businessDescription isn't part of the JWT payload (AuthUser stays minimal/unchanged -
    // it's used broadly via the auth context) - one extra lookup, returned alongside instead of
    // reshaping `user`.
    const profile = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        businessDescription: true,
        communicationStyle: true,
        platformStyleGuides: true,
        brandHashtag: true,
        autopilotEnabled: true,
        twoFactorEnabled: true,
      },
    });
    return NextResponse.json({
      user,
      businessDescription: profile?.businessDescription ?? null,
      communicationStyle: profile?.communicationStyle ?? null,
      platformStyleGuides: readPlatformStyleGuides(profile?.platformStyleGuides),
      brandHashtag: profile?.brandHashtag ?? null,
      autopilotEnabled: profile?.autopilotEnabled ?? false,
      twoFactorEnabled: profile?.twoFactorEnabled ?? false,
    });
  } catch {
    return unauthorized();
  }
}

const BUSINESS_DESCRIPTION_MAX_LENGTH = 500;
const COMMUNICATION_STYLE_MAX_LENGTH = 500;

export async function PATCH(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json()) as {
      defaultExplicitContent?: boolean;
      businessDescription?: string;
      communicationStyle?: string;
      platformStyleGuides?: unknown;
      brandHashtag?: string;
      autopilotEnabled?: boolean;
    };

    const data: {
      defaultExplicitContent?: boolean;
      businessDescription?: string | null;
      communicationStyle?: string | null;
      platformStyleGuides?: PlatformStyleGuides;
      brandHashtag?: string | null;
      autopilotEnabled?: boolean;
    } = {};

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

    if (body.communicationStyle !== undefined) {
      if (typeof body.communicationStyle !== 'string') {
        return badRequest('Validation failed', ['communicationStyle: wymagany tekst']);
      }
      const trimmed = body.communicationStyle.trim();
      if (trimmed.length > COMMUNICATION_STYLE_MAX_LENGTH) {
        return badRequest('Validation failed', [
          `communicationStyle: maksymalnie ${COMMUNICATION_STYLE_MAX_LENGTH} znaków`,
        ]);
      }
      data.communicationStyle = trimmed || null;
    }

    if (body.platformStyleGuides !== undefined) {
      const parsed = parsePlatformStyleGuidesInput(body.platformStyleGuides);
      if (!parsed.ok) {
        return badRequest('Validation failed', parsed.errors);
      }
      data.platformStyleGuides = parsed.value;
    }

    if (body.brandHashtag !== undefined) {
      if (typeof body.brandHashtag !== 'string' || body.brandHashtag.trim().length > BRAND_HASHTAG_MAX_LENGTH) {
        return badRequest('Validation failed', [`brandHashtag: tekst do ${BRAND_HASHTAG_MAX_LENGTH} znaków`]);
      }
      data.brandHashtag = normalizeBrandHashtag(body.brandHashtag);
    }

    if (body.autopilotEnabled !== undefined) {
      if (typeof body.autopilotEnabled !== 'boolean') {
        return badRequest('Validation failed', ['autopilotEnabled: wymagana wartość boolean']);
      }
      data.autopilotEnabled = body.autopilotEnabled;
    }

    if (Object.keys(data).length === 0) {
      return badRequest('Validation failed', ['Brak pól do zapisania']);
    }

    const updated = await prisma.user.update({
      where: { id: user.userId },
      data,
      select: {
        id: true,
        defaultExplicitContent: true,
        businessDescription: true,
        communicationStyle: true,
        platformStyleGuides: true,
        brandHashtag: true,
        autopilotEnabled: true,
      },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return badRequest('Nie udało się zapisać ustawienia.');
  }
}
