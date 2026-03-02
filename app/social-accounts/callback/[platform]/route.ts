import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string }> },
) {
  const params = await context.params;
  const normalizedPlatform = params.platform.toLowerCase();
  const redirectToCanonical = new URL(
    `/api/auth/callback/${normalizedPlatform}`,
    request.nextUrl.origin,
  );

  request.nextUrl.searchParams.forEach((value, key) => {
    redirectToCanonical.searchParams.set(key, value);
  });

  return NextResponse.redirect(redirectToCanonical, 302);
}
