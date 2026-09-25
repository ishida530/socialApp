// External content intake (2026-09-23) - server-to-server entry point for other in-house sites
// (Prymat Nieruchomości: a new blog post going live, a new Asari listing appearing) to create a
// DRAFT social post here, waiting for approval like any other draft. Bearer-secret auth, same
// shape as app/api/cron/publish's CRON_SECRET check - this is machine-to-machine, not a logged-in
// browser session, so the cookie-based getAuthUserFromRequest doesn't apply here.
import { NextRequest, NextResponse } from 'next/server';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { ingestExternalContent, type ExternalContentPayload } from '@/lib/server/external-content';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.EXTERNAL_CONTENT_SECRET;
  if (!secret) {
    throw new Error('Missing required config: EXTERNAL_CONTENT_SECRET');
  }

  return request.headers.get('authorization') === `Bearer ${secret}`;
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
};

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
  if (body.price !== undefined && typeof body.price !== 'number') {
    errors.push('price: musi być liczbą, jeśli podane');
  }

  return errors;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return unauthorized('Invalid content-intake secret');
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
    };

    const result = await ingestExternalContent(payload);

    if (!result.ok) {
      return badRequest(result.error);
    }

    return NextResponse.json(result);
  } catch (error) {
    return serverError(error);
  }
}
