import { NextRequest, NextResponse } from 'next/server';
import { PublishStatus } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { serverError } from '@/lib/server/http';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

function emptySummary() {
  return {
    PENDING: 0,
    RUNNING: 0,
    SUCCESS: 0,
    FAILED: 0,
    CANCELED: 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { limit, offset } = parsePagination(request);

    const [data, totalCount, grouped] = await Promise.all([
      prisma.publishJob.findMany({
        include: {
          video: {
            select: {
              title: true,
              user: {
                select: {
                  id: true,
                  email: true,
                },
              },
            },
          },
          socialAccount: {
            select: {
              platform: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.publishJob.count(),
      prisma.publishJob.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    const summary = emptySummary();
    grouped.forEach((row) => {
      summary[row.status as PublishStatus] = row._count._all;
    });

    return NextResponse.json({
      data,
      totalCount,
      hasMore: offset + data.length < totalCount,
      summary,
    });
  } catch (error) {
    return serverError(error);
  }
}
