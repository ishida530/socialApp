import { NextResponse } from 'next/server';
import { buildBillingCapabilities } from '@/lib/billing/capabilities';
import { serverError } from '@/lib/server/http';

export async function GET() {
  try {
    return NextResponse.json(buildBillingCapabilities());
  } catch (error) {
    return serverError(error);
  }
}
