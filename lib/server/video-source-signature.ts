import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_TTL_SECONDS = 15 * 60;

function getSigningSecret() {
  return (
    process.env.VIDEO_SOURCE_SIGNING_SECRET ||
    process.env.JWT_SECRET ||
    process.env.OAUTH_STATE_SECRET
  );
}

function toSafeBuffer(value: string) {
  return Buffer.from(value, 'utf8');
}

function signPayload(videoId: string, expiresAtSec: number) {
  const secret = getSigningSecret();
  if (!secret) {
    throw new Error('Missing required config: VIDEO_SOURCE_SIGNING_SECRET or JWT_SECRET');
  }

  const payload = `${videoId}:${expiresAtSec}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function createSignedVideoSourceParams(videoId: string, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const expiresAtSec = Math.floor(Date.now() / 1000) + Math.max(30, Math.floor(ttlSeconds));
  const sig = signPayload(videoId, expiresAtSec);

  return {
    exp: String(expiresAtSec),
    sig,
  };
}

export function isValidSignedVideoSource(
  videoId: string,
  expRaw: string | null,
  sigRaw: string | null,
) {
  if (!expRaw || !sigRaw) {
    return false;
  }

  const expiresAtSec = Number(expRaw);
  if (!Number.isFinite(expiresAtSec)) {
    return false;
  }

  if (Math.floor(Date.now() / 1000) > expiresAtSec) {
    return false;
  }

  try {
    const expectedSig = signPayload(videoId, Math.floor(expiresAtSec));
    const expectedBuffer = toSafeBuffer(expectedSig);
    const providedBuffer = toSafeBuffer(sigRaw);

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}

export function buildSignedVideoSourceUrl(
  frontendUrl: string,
  videoId: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
) {
  const url = new URL(`/api/videos/${videoId}/source`, frontendUrl);
  const params = createSignedVideoSourceParams(videoId, ttlSeconds);
  url.searchParams.set('exp', params.exp);
  url.searchParams.set('sig', params.sig);

  return url.toString();
}
