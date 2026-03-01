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

export function notFound(message = 'Not found') {
  return NextResponse.json(
    {
      message,
    },
    { status: 404 },
  );
}

export function serverError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error';
  return NextResponse.json(
    {
      message,
    },
    { status: 500 },
  );
}
