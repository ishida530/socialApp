import { NextRequest, NextResponse } from 'next/server';
import { verifyEmailToken } from '@/lib/server/email-verification';
import { getFrontendUrl } from '@/lib/server/social-oauth';

// Target of the link in the verification email. Always ends on a page the user understands.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const result = token ? await verifyEmailToken(token) : { ok: false as const };
  const target = new URL('/dashboard', getFrontendUrl());
  target.searchParams.set('emailVerified', result.ok ? '1' : 'invalid');
  return NextResponse.redirect(target, 302);
}
