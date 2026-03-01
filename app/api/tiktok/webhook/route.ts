import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const challenge =
    request.nextUrl.searchParams.get('challenge') ??
    request.nextUrl.searchParams.get('challenge_code');

  if (challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  let payload: unknown = null;

  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  return NextResponse.json({ received: true, payload });
}
