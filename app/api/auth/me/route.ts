import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { unauthorized } from '@/lib/server/http';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    return NextResponse.json({ user });
  } catch {
    return unauthorized();
  }
}
