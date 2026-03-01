import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { decrypt, encrypt } from './crypto';
import { prisma } from './prisma';

type OAuthProvider = 'youtube' | 'tiktok';
type PrismaPlatform = 'YOUTUBE' | 'TIKTOK';

type TokenResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
};

export type OAuthCallbackQuery = {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
};

export function getFrontendUrl() {
  return process.env.FRONTEND_URL ?? 'https://social-app-five-lyart.vercel.app';
}

function getProvider(platformInput: string): OAuthProvider {
  const normalized = platformInput?.toLowerCase();

  if (normalized === 'youtube') {
    return 'youtube';
  }

  if (normalized === 'tiktok') {
    return 'tiktok';
  }

  throw new Error('Unsupported platform. Use youtube or tiktok.');
}

function requireConfig(key: string) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required config: ${key}`);
  }

  return value;
}

function requireAnyConfig(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required config. Tried: ${keys.join(', ')}`);
}

function resolveTikTokScope() {
  const rawScope = process.env.TIKTOK_OAUTH_SCOPES || 'user.info.profile';

  return rawScope
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(',');
}

function generateCodeVerifier() {
  return randomBytes(64).toString('base64url');
}

function createCodeChallenge(codeVerifier: string) {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

function signOAuthState(userId: string) {
  const payload = {
    userId,
    exp: Date.now() + 10 * 60 * 1000,
  };

  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', requireConfig('OAUTH_STATE_SECRET'))
    .update(payloadEncoded)
    .digest('base64url');

  return `${payloadEncoded}.${signature}`;
}

function verifyOAuthState(state: string) {
  const [payloadEncoded, signature] = state.split('.');
  if (!payloadEncoded || !signature) {
    throw new Error('Invalid OAuth state payload');
  }

  const expectedSignature = createHmac('sha256', requireConfig('OAUTH_STATE_SECRET'))
    .update(payloadEncoded)
    .digest('base64url');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const providedBuffer = Buffer.from(signature, 'utf8');

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new Error('Invalid OAuth state signature');
  }

  const payload = JSON.parse(
    Buffer.from(payloadEncoded, 'base64url').toString('utf8'),
  ) as {
    userId?: string;
    exp?: number;
  };

  if (!payload.userId || !payload.exp) {
    throw new Error('Invalid OAuth state content');
  }

  if (Date.now() > payload.exp) {
    throw new Error('OAuth state expired');
  }

  return payload.userId;
}

function toPrismaPlatform(provider: OAuthProvider): PrismaPlatform {
  return provider === 'youtube' ? 'YOUTUBE' : 'TIKTOK';
}

export function buildAuthUrl(platformInput: string, userId: string) {
  const provider = getProvider(platformInput);
  const state = signOAuthState(userId);

  if (provider === 'youtube') {
    const params = new URLSearchParams({
      client_id: requireConfig('GOOGLE_CLIENT_ID'),
      redirect_uri: requireConfig('GOOGLE_REDIRECT_URI'),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
      state,
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_key: requireAnyConfig(['TIKTOK_KEY', 'TIKTOK_CLIENT_ID']),
    response_type: 'code',
    redirect_uri: requireConfig('TIKTOK_REDIRECT_URI'),
    scope: resolveTikTokScope(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    url: `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`,
    tiktokPkce: {
      state,
      codeVerifier,
    },
  };
}

export function encodePkcePayload(payload: { state: string; codeVerifier: string }) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodePkcePayload(payload: string) {
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    state?: string;
    codeVerifier?: string;
  };

  if (!parsed.state || !parsed.codeVerifier) {
    throw new Error('Incomplete TikTok PKCE cookie payload');
  }

  return parsed;
}

async function exchangeGoogleCode(code: string): Promise<TokenResult> {
  const params = new URLSearchParams({
    client_id: requireConfig('GOOGLE_CLIENT_ID'),
    client_secret: requireConfig('GOOGLE_CLIENT_SECRET'),
    code,
    grant_type: 'authorization_code',
    redirect_uri: requireConfig('GOOGLE_REDIRECT_URI'),
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google token exchange failed: ${errorBody || response.statusText}`);
  }

  const tokenJson = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiresAt: tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000)
      : undefined,
  };
}

async function exchangeTikTokCode(code: string, codeVerifier?: string): Promise<TokenResult> {
  if (!codeVerifier) {
    throw new Error('Missing TikTok PKCE code_verifier');
  }

  const params = new URLSearchParams({
    client_key: requireAnyConfig(['TIKTOK_KEY', 'TIKTOK_CLIENT_ID']),
    client_secret: requireAnyConfig(['TIKTOK_SECRET', 'TIKTOK_CLIENT_SECRET']),
    code,
    grant_type: 'authorization_code',
    redirect_uri: requireConfig('TIKTOK_REDIRECT_URI'),
    code_verifier: codeVerifier,
  });

  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`TikTok token exchange failed: ${errorBody || response.statusText}`);
  }

  const tokenJson = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiresAt: tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000)
      : undefined,
  };
}

async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Unable to fetch Google user profile');
  }

  const profile = (await response.json()) as {
    id?: string;
    email?: string;
    name?: string;
  };

  return {
    externalId: profile.id ?? profile.email ?? null,
    handle: profile.name ?? profile.email ?? 'YouTube account',
  };
}

async function fetchTikTokProfile(accessToken: string) {
  const response = await fetch(
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error('Unable to fetch TikTok user profile');
  }

  const payload = (await response.json()) as {
    data?: {
      user?: {
        open_id?: string;
        display_name?: string;
      };
    };
  };

  return {
    externalId: payload.data?.user?.open_id ?? null,
    handle: payload.data?.user?.display_name ?? 'TikTok account',
  };
}

export async function handleOAuthCallback(
  platformInput: string,
  query: OAuthCallbackQuery,
  options?: { tiktokCodeVerifier?: string },
) {
  if (query.error) {
    throw new Error(query.error_description || `OAuth error: ${query.error}`);
  }

  if (!query.code || !query.state) {
    throw new Error('Missing OAuth callback parameters');
  }

  const provider = getProvider(platformInput);
  const ownerId = verifyOAuthState(query.state);

  const tokenResult =
    provider === 'youtube'
      ? await exchangeGoogleCode(query.code)
      : await exchangeTikTokCode(query.code, options?.tiktokCodeVerifier);

  const profile =
    provider === 'youtube'
      ? await fetchGoogleProfile(tokenResult.accessToken)
      : await fetchTikTokProfile(tokenResult.accessToken);

  const prismaPlatform = toPrismaPlatform(provider);

  const existing = await prisma.socialAccount.findFirst({
    where: {
      userId: ownerId,
      platform: prismaPlatform,
    },
  });

  const encryptedAccessToken = encrypt(tokenResult.accessToken);
  const encryptedRefreshToken = tokenResult.refreshToken
    ? encrypt(tokenResult.refreshToken)
    : existing?.refreshToken;

  const saved = existing
    ? await prisma.socialAccount.update({
        where: { id: existing.id },
        data: {
          userId: ownerId,
          platform: prismaPlatform,
          handle: profile.handle,
          externalId: profile.externalId,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: tokenResult.expiresAt,
        },
      })
    : await prisma.socialAccount.create({
        data: {
          userId: ownerId,
          platform: prismaPlatform,
          handle: profile.handle,
          externalId: profile.externalId,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: tokenResult.expiresAt,
        },
      });

  return {
    success: true,
    platform: provider,
    accountId: saved.id,
    handle: saved.handle,
    message: `Konto ${provider === 'youtube' ? 'YouTube' : 'TikTok'} połączone!`,
  };
}

export function decryptToken(value?: string | null) {
  if (!value) {
    return undefined;
  }

  return decrypt(value);
}
