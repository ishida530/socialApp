import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { getActiveGoals, setGoal } from '@/lib/server/coaching';

// Web equivalent of the Telegram /goal, /goals commands.
const MAX_GOAL_LENGTH = 300;

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const goals = await getActiveGoals(user.userId);
    return NextResponse.json({ goals });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json().catch(() => ({}))) as { description?: string };
    const description = body.description?.trim();

    if (!description) {
      return badRequest('Validation failed', ['description: wymagany opis celu']);
    }
    if (description.length > MAX_GOAL_LENGTH) {
      return badRequest('Validation failed', [`description: maksymalnie ${MAX_GOAL_LENGTH} znaków`]);
    }

    const goal = await setGoal(user.userId, description);
    return NextResponse.json({ goal });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
