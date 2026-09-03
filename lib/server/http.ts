import { NextResponse } from 'next/server';

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

export function serverError(error: unknown) {
  return NextResponse.json(
    {
      message: 'Internal server error',
    },
    { status: 500 },
  );
}
