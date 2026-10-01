import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';

// ?shallow=1 - the app header's "service is up" indicator, polled by every open tab: answers
// without touching the database. Without it (uptime monitors) the DB is checked with SELECT 1.
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('shallow') === '1') {
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: 'ok',
      database: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'error',
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
