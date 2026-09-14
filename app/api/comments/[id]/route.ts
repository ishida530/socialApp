import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { acceptSuggestedReply, ignoreComment, sendCustomReply } from '@/lib/server/social-comments';

// TASK-11.2.8 (content-confirmation gate) applies here exactly as it does on Telegram: "accept"
// sends precisely the suggestion already shown to the owner, "reply" sends precisely the text the
// owner typed - never anything the owner hasn't seen and explicitly chosen.
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getAuthUserFromRequest(request);
    const params = await context.params;
    const body = (await request.json().catch(() => ({}))) as { action?: string; text?: string };

    const result =
      body.action === 'accept'
        ? await acceptSuggestedReply(params.id, user.userId)
        : body.action === 'ignore'
          ? await ignoreComment(params.id, user.userId)
          : body.action === 'reply' && body.text?.trim()
            ? await sendCustomReply(params.id, user.userId, body.text.trim())
            : null;

    if (!result) {
      return badRequest('Validation failed', ['action: wymagane "accept", "ignore" albo "reply" (z niepustym "text")']);
    }

    if (!result.ok) {
      return badRequest(result.error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
