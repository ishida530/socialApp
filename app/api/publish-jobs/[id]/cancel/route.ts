import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = getAuthUserFromRequest(request);

    const rateLimit = await consumeRateLimit({
      key: `publish-jobs:cancel:${user.userId}`,
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return tooManyRequests('Too many requests. Try again later.', rateLimit.retryAfterSec);
    }

    const params = await context.params;

    const job = await prisma.publishJob.findFirst({
      where: {
        id: params.id,
        video: {
          userId: user.userId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!job) {
      return badRequest('Nie znaleziono zadania publikacji dla użytkownika');
    }

    if (job.status === 'SUCCESS' || job.status === 'FAILED' || job.status === 'CANCELED') {
      return badRequest('Tego zadania nie można anulować w aktualnym statusie');
    }

    const updated = await prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: 'CANCELED',
        errorMessage: 'Anulowane ręcznie przez użytkownika.',
      },
    });

    return NextResponse.json({ success: true, publishJob: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}