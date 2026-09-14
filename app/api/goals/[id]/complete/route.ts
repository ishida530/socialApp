import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { completeGoal } from '@/lib/server/coaching';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getAuthUserFromRequest(request);
    const params = await context.params;
    const result = await completeGoal(user.userId, params.id);

    if (!result.ok) {
      return badRequest(result.error);
    }

    return NextResponse.json({ goal: result.goal });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
