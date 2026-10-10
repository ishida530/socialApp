import { NextRequest, NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/site-url';
import { logError } from '@/lib/server/observability';
import {
  createDeletionConfirmationCode,
  deleteMetaUserData,
  parseMetaSignedRequest,
} from '@/lib/server/meta-data-deletion';

// Meta "Data deletion callback URL" (App settings -> Basic -> User data deletion). Meta POSTs a
// form-encoded signed_request; we verify it, delete the user's Facebook/Instagram data and answer
// with the JSON Meta requires - see lib/server/meta-data-deletion.ts.
export async function POST(request: NextRequest) {
  let signedRequest: string | null = null;
  try {
    const form = await request.formData();
    const value = form.get('signed_request');
    signedRequest = typeof value === 'string' ? value : null;
  } catch {
    signedRequest = null;
  }

  const payload = signedRequest ? parseMetaSignedRequest(signedRequest) : null;
  if (!payload || typeof payload.user_id !== 'string' || payload.user_id.length === 0) {
    return NextResponse.json({ error: 'Invalid signed_request' }, { status: 400 });
  }

  const confirmationCode = createDeletionConfirmationCode();
  try {
    await deleteMetaUserData(payload.user_id, confirmationCode);
  } catch (error) {
    logError('meta-data-deletion', 'request-failed', error, { confirmationCode });
    return NextResponse.json({ error: 'Deletion failed, please retry' }, { status: 500 });
  }

  return NextResponse.json({
    url: `${getSiteUrl()}/data-deletion?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
