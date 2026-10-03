import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { logError } from './observability';

export function badRequest(message: string, errors?: string[]) {
  return NextResponse.json(
    {
      message,
      errors,
    },
    { status: 400 },
  );
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json(
    {
      message,
    },
    { status: 401 },
  );
}

export function tooManyRequests(message = 'Too many requests', retryAfterSec?: number) {
  const headers = retryAfterSec
    ? { 'Retry-After': String(retryAfterSec) }
    : undefined;

  return NextResponse.json(
    {
      message,
    },
    {
      status: 429,
      headers,
    },
  );
}

export function notFound(message = 'Not found') {
  return NextResponse.json(
    {
      message,
    },
    { status: 404 },
  );
}

// Handled 500s used to vanish (2026-10-03, QA review): Sentry's onRequestError only sees uncaught
// errors, and almost every route catches its own. Log and report here, once, for all of them.
export function serverError(error: unknown) {
  logError('http', 'server-error', error);
  Sentry.captureException(error);

  return NextResponse.json(
    {
      message: 'Internal server error',
    },
    { status: 500 },
  );
}
