import { NextResponse } from 'next/server';
import { isRegistrationOpen } from '@/lib/server/app-mode';

// Public, unauthenticated: lets the register page warn the user *before* they fill in
// the whole form that registration is closed, instead of only finding out from the
// POST /api/auth/register error after submitting.
export async function GET() {
  return NextResponse.json({ open: await isRegistrationOpen() });
}
