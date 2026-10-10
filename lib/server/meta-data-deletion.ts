import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from './prisma';
import { logEvent } from './observability';

// Meta Data Deletion Request callback (2026-10-10). When a person removes Postfly in Facebook's
// Business Integrations and asks for their data to be deleted, Meta POSTs a signed_request here and
// expects JSON { url, confirmation_code }. Before this endpoint existed Meta reported "postfly sent
// an invalid response to your request".
// Docs: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback

export type MetaSignedRequestPayload = {
  algorithm?: string;
  user_id?: string;
  issued_at?: number;
  [key: string]: unknown;
};

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// Facebook and Instagram may use separate Meta apps (INSTAGRAM_CLIENT_SECRET) - accept a request
// signed by either app's secret.
function metaAppSecrets(): string[] {
  return [process.env.FACEBOOK_CLIENT_SECRET, process.env.INSTAGRAM_CLIENT_SECRET].filter(
    (secret, index, all): secret is string => !!secret && all.indexOf(secret) === index,
  );
}

// Verifies the HMAC-SHA256 signature with the app secret and returns the payload, or null when the
// request is malformed or not signed by our app.
export function parseMetaSignedRequest(signedRequest: string, secrets = metaAppSecrets()): MetaSignedRequestPayload | null {
  const [encodedSignature, encodedPayload] = signedRequest.split('.', 2);
  if (!encodedSignature || !encodedPayload || secrets.length === 0) {
    return null;
  }

  let payload: MetaSignedRequestPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload.algorithm !== 'string' || payload.algorithm.toUpperCase() !== 'HMAC-SHA256') {
    return null;
  }

  const signature = base64UrlDecode(encodedSignature);
  const signedBySecret = secrets.some((secret) => {
    const expected = createHmac('sha256', secret).update(encodedPayload).digest();
    return expected.length === signature.length && timingSafeEqual(expected, signature);
  });

  return signedBySecret ? payload : null;
}

export function createDeletionConfirmationCode() {
  return randomBytes(9).toString('hex');
}

// Deletes every Facebook Page / Instagram account this Facebook user connected - the same thing the
// "Rozłącz" button does: the row and its cascade (publish jobs, comments, metrics, growth snapshots,
// encrypted tokens). Meta has already revoked the grant on its side, so there is nothing to revoke.
export async function deleteMetaUserData(metaUserId: string, confirmationCode: string) {
  const accounts = await prisma.socialAccount.findMany({
    where: { metaUserId, platform: { in: ['FACEBOOK', 'INSTAGRAM'] } },
    select: { id: true },
  });

  if (accounts.length > 0) {
    await prisma.socialAccount.deleteMany({ where: { id: { in: accounts.map((account) => account.id) } } });
  }

  logEvent('meta-data-deletion', 'request-processed', {
    confirmationCode,
    deletedAccounts: accounts.length,
  });

  return { deletedAccounts: accounts.length };
}
