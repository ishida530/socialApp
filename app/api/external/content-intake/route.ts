// External content intake (2026-09-23) - server-to-server entry point for a customer's website
// (e.g. Pryzmat Nieruchomości: a new blog post going live, a new CRM listing appearing) to create
// a DRAFT social post here, waiting for approval like any other draft. Machine-to-machine, not a
// logged-in browser session, so the cookie-based getAuthUserFromRequest doesn't apply here.
//
// Auth (2026-09-25, multi-tenant): "Authorization: Bearer <integration key>" - the key decides
// which account receives the drafts (its social accounts, its writing settings). Legacy: the
// shared EXTERNAL_CONTENT_SECRET still works and targets the instance owner (first account), so
// integrations set up before per-account keys keep working until they switch to a key.
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { ingestExternalContent, type ExternalContentPayload } from '@/lib/server/external-content';
import { resolveIntegrationKey } from '@/lib/server/integration-keys';
import { prisma } from '@/lib/server/prisma';
import { STYLE_GUIDE_MAX_LENGTH, STYLE_GUIDE_PLATFORMS } from '@/lib/server/platform-style-guides';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function resolveTargetUserId(request: NextRequest): Promise<string | null> {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!bearer) return null;

  const byKey = await resolveIntegrationKey(bearer);
  if (byKey) return byKey.userId;

  const legacySecret = process.env.EXTERNAL_CONTENT_SECRET;
  if (legacySecret && safeEqual(bearer, legacySecret)) {
    const owner = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    return owner?.id ?? null;
  }
  return null;
}

type IntakeBody = {
  type?: string;
  sourceRef?: string;
  title?: string;
  excerpt?: string;
  url?: string;
  imageUrl?: string;
  price?: number;
  location?: string;
  category?: string;
  brandContext?: string;
  platformGuides?: Record<string, string>;
  brandHashtag?: string;
  siteLabel?: string;
};

const MAX_BRAND_CONTEXT_LENGTH = 2000;

function validate(body: IntakeBody): string[] {
  const errors: string[] = [];

  if (body.type !== 'blog' && body.type !== 'listing') {
    errors.push('type: musi być "blog" albo "listing"');
  }
  if (!body.sourceRef || typeof body.sourceRef !== 'string') {
    errors.push('sourceRef: wymagany string, unikalny identyfikator źródła');
  }
  if (!body.title || typeof body.title !== 'string') {
    errors.push('title: wymagany string');
  }
  if (!body.excerpt || typeof body.excerpt !== 'string') {
    errors.push('excerpt: wymagany string');
  }
  if (!body.url || typeof body.url !== 'string') {
    errors.push('url: wymagany string');
  }
  if (!body.imageUrl || typeof body.imageUrl !== 'string') {
    errors.push('imageUrl: wymagany string');
  }
  if (
    body.brandContext !== undefined &&
    (typeof body.brandContext !== 'string' || body.brandContext.length > MAX_BRAND_CONTEXT_LENGTH)
  ) {
    errors.push(`brandContext: string do ${MAX_BRAND_CONTEXT_LENGTH} znaków, jeśli podany`);
  }
  if (body.platformGuides !== undefined) {
    const guides = body.platformGuides;
    const valid =
      guides !== null &&
      typeof guides === 'object' &&
      !Array.isArray(guides) &&
      Object.entries(guides).every(
        ([platform, text]) =>
          (STYLE_GUIDE_PLATFORMS as readonly string[]).includes(platform) &&
          typeof text === 'string' &&
          text.length <= STYLE_GUIDE_MAX_LENGTH,
      );
    if (!valid) {
      errors.push(`platformGuides: obiekt { PLATFORMA: tekst do ${STYLE_GUIDE_MAX_LENGTH} znaków }`);
    }
  }
  for (const field of ['brandHashtag', 'siteLabel'] as const) {
    const value = body[field];
    if (value !== undefined && (typeof value !== 'string' || value.length > 100)) {
      errors.push(`${field}: string do 100 znaków, jeśli podany`);
    }
  }
  if (body.price !== undefined && typeof body.price !== 'number') {
    errors.push('price: musi być liczbą, jeśli podane');
  }

  return errors;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveTargetUserId(request);
    if (!userId) {
      return unauthorized('Invalid integration key');
    }

    const body = (await request.json()) as IntakeBody;
    const errors = validate(body);
    if (errors.length > 0) {
      return badRequest('Validation failed', errors);
    }

    const payload: ExternalContentPayload = {
      type: body.type === 'blog' ? 'BLOG_POST' : 'LISTING',
      sourceRef: body.sourceRef!,
      title: body.title!,
      excerpt: body.excerpt!,
      url: body.url!,
      imageUrl: body.imageUrl!,
      price: body.price,
      location: body.location,
      category: body.category,
      brandContext: body.brandContext,
      platformGuides: body.platformGuides,
      brandHashtag: body.brandHashtag,
      siteLabel: body.siteLabel,
    };

    const result = await ingestExternalContent(userId, payload);

    if (!result.ok) {
      return badRequest(result.error);
    }

    return NextResponse.json(result);
  } catch (error) {
    return serverError(error);
  }
}
