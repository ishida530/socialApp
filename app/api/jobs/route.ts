import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { serverError, unauthorized } from '@/lib/server/http';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function parsePagination(request: NextRequest) {
  const limitParam = Number(request.nextUrl.searchParams.get('limit'));
  const offsetParam = Number(request.nextUrl.searchParams.get('offset'));

  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.trunc(limitParam), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const offset = Number.isFinite(offsetParam)
    ? Math.max(Math.trunc(offsetParam), 0)
    : 0;

  return { limit, offset };
}

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const { limit, offset } = parsePagination(request);

    const where = {
      video: {
        userId: user.userId,
      },
    };

    const [data, totalCount] = await Promise.all([
      prisma.publishJob.findMany({
        where,
        include: {
          video: true,
          socialAccount: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.publishJob.count({ where }),
    ]);

    return NextResponse.json({
      data,
      totalCount,
      hasMore: offset + data.length < totalCount,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
