import { NextRequest, NextResponse } from 'next/server';
import { CONTACT_CATEGORY_VALUES, type ContactCategory } from '@/lib/contact';
import { sendContactMessageEmail } from '@/lib/mail/service';
import { hasTrippedHoneypot } from '@/lib/server/honeypot';
import { badRequest, serverError, tooManyRequests } from '@/lib/server/http';
import { consumeRateLimit, getRequestIp } from '@/lib/server/rate-limit';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function genericSuccessResponse() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const rateLimit = await consumeRateLimit({
      key: `contact:submit:${ip}`,
      limit: 6,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return tooManyRequests('Too many contact attempts. Try again later.', rateLimit.retryAfterSec);
    }

    const body = (await request.json()) as {
      name?: string;
      email?: string;
      category?: ContactCategory;
      message?: string;
      hpWebsite?: string;
      formStartedAt?: number | string;
    };

    if (hasTrippedHoneypot(body)) {
      return genericSuccessResponse();
    }

    const name = body.name?.trim() ?? '';
    const email = body.email?.trim().toLowerCase() ?? '';
    const message = body.message?.trim() ?? '';
    const category = body.category;

    if (!name || name.length < 2) {
      return badRequest('Validation failed', ['name: Podaj imie i nazwisko']);
    }

    if (!email || !isValidEmail(email)) {
      return badRequest('Validation failed', ['email: Podaj poprawny adres e-mail']);
    }

    if (!category || !CONTACT_CATEGORY_VALUES.has(category)) {
      return badRequest('Validation failed', ['category: Wybierz kategorie wiadomosci']);
    }

    if (!message || message.length < 10) {
      return badRequest('Validation failed', ['message: Wiadomosc musi miec min. 10 znakow']);
    }

    if (message.length > 4000) {
      return badRequest('Validation failed', ['message: Wiadomosc jest za dluga']);
    }

    await sendContactMessageEmail({
      name,
      email,
      category,
      message,
      source: 'landing',
      ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return genericSuccessResponse();
  } catch (error) {
    return serverError(error);
  }
}
