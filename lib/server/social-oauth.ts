import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { decrypt, encrypt } from './crypto';
import { prisma } from './prisma';
import { assertSocialAccountsLimit } from './subscription';

type OAuthProvider = 'youtube' | 'tiktok' | 'facebook' | 'instagram';
type PrismaPlatform = 'YOUTUBE' | 'TIKTOK' | 'FACEBOOK' | 'INSTAGRAM';

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

  if (normalized === 'facebook') {
    return 'facebook';
  }

  if (normalized === 'instagram') {
    return 'instagram';
  }

  throw new Error('Unsupported platform. Use youtube, tiktok, facebook or instagram.');
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
  const requiredScopeRaw = process.env.TIKTOK_OAUTH_REQUIRED_SCOPES || '';

  const scopes = rawScope
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const requiredScopes = requiredScopeRaw
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const required of requiredScopes) {
    if (!scopes.includes(required)) {
      scopes.push(required);
    }
  }

  return scopes.join(',');
}

function resolveMetaApiVersion() {
  return process.env.META_GRAPH_API_VERSION || 'v23.0';
}

function resolveFacebookScope() {
  return process.env.FACEBOOK_OAUTH_SCOPES || 'public_profile,email,pages_show_list';
}

function resolveInstagramScope() {
  return process.env.INSTAGRAM_OAUTH_SCOPES || 'instagram_basic,pages_show_list,business_management';
}

function resolveMetaClientId(provider: 'facebook' | 'instagram') {
  if (provider === 'instagram') {
    return requireAnyConfig(['INSTAGRAM_CLIENT_ID', 'FACEBOOK_CLIENT_ID']);
  }

  return requireConfig('FACEBOOK_CLIENT_ID');
}

function resolveMetaClientSecret(provider: 'facebook' | 'instagram') {
  if (provider === 'instagram') {
    return requireAnyConfig(['INSTAGRAM_CLIENT_SECRET', 'FACEBOOK_CLIENT_SECRET']);
  }

  return requireConfig('FACEBOOK_CLIENT_SECRET');
}

function resolveMetaRedirectUri(provider: 'facebook' | 'instagram') {
  if (provider === 'instagram') {
    return requireAnyConfig(['INSTAGRAM_REDIRECT_URI', 'FACEBOOK_REDIRECT_URI']);
  }

  return requireConfig('FACEBOOK_REDIRECT_URI');
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
  if (provider === 'youtube') {
    return 'YOUTUBE';
  }

  if (provider === 'tiktok') {
    return 'TIKTOK';
  }

  if (provider === 'facebook') {
    return 'FACEBOOK';
  }

  return 'INSTAGRAM';
}

export function buildAuthUrl(
  platformInput: string,
  userId: string,
) {
  const provider = getProvider(platformInput);
  const state = signOAuthState(userId);

  if (provider === 'youtube') {
    const params = new URLSearchParams({
      client_id: requireConfig('GOOGLE_CLIENT_ID'),
      redirect_uri: requireConfig('GOOGLE_REDIRECT_URI'),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope:
        'openid email profile https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload',
      state,
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  }

  if (provider === 'facebook' || provider === 'instagram') {
    const version = resolveMetaApiVersion();
    const params = new URLSearchParams({
      client_id: resolveMetaClientId(provider),
      redirect_uri: resolveMetaRedirectUri(provider),
      response_type: 'code',
      state,
      scope: provider === 'facebook' ? resolveFacebookScope() : resolveInstagramScope(),
    });

    return {
      url: `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`,
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

async function exchangeMetaCode(code: string, provider: 'facebook' | 'instagram'): Promise<TokenResult> {
  const version = resolveMetaApiVersion();
  const params = new URLSearchParams({
    client_id: resolveMetaClientId(provider),
    client_secret: resolveMetaClientSecret(provider),
    redirect_uri: resolveMetaRedirectUri(provider),
    code,
  });

  const response = await fetch(
    `https://graph.facebook.com/${version}/oauth/access_token?${params.toString()}`,
    {
      method: 'GET',
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Meta token exchange failed: ${errorBody || response.statusText}`);
  }

  const tokenJson = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!tokenJson.access_token) {
    throw new Error('Meta token exchange failed: missing access_token');
  }

  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.access_token,
    expiresAt: tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000)
      : undefined,
  };
}

async function refreshGoogleToken(refreshToken: string): Promise<TokenResult> {
  const params = new URLSearchParams({
    client_id: requireConfig('GOOGLE_CLIENT_ID'),
    client_secret: requireConfig('GOOGLE_CLIENT_SECRET'),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google token refresh failed: ${errorBody || response.statusText}`);
  }

  const tokenJson = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!tokenJson.access_token) {
    throw new Error('Google token refresh failed: missing access_token');
  }

  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiresAt: tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000)
      : undefined,
  };
}

async function refreshTikTokToken(refreshToken: string): Promise<TokenResult> {
  const params = new URLSearchParams({
    client_key: requireAnyConfig(['TIKTOK_KEY', 'TIKTOK_CLIENT_ID']),
    client_secret: requireAnyConfig(['TIKTOK_SECRET', 'TIKTOK_CLIENT_SECRET']),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`TikTok token refresh failed: ${errorBody || response.statusText}`);
  }

  const tokenJson = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!tokenJson.access_token) {
    throw new Error('TikTok token refresh failed: missing access_token');
  }

  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiresAt: tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000)
      : undefined,
  };
}

async function refreshMetaToken(accessToken: string, provider: 'facebook' | 'instagram'): Promise<TokenResult> {
  const version = resolveMetaApiVersion();
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: resolveMetaClientId(provider),
    client_secret: resolveMetaClientSecret(provider),
    fb_exchange_token: accessToken,
  });

  const response = await fetch(
    `https://graph.facebook.com/${version}/oauth/access_token?${params.toString()}`,
    {
      method: 'GET',
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Meta token refresh failed: ${errorBody || response.statusText}`);
  }

  const tokenJson = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!tokenJson.access_token) {
    throw new Error('Meta token refresh failed: missing access_token');
  }

  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.access_token,
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

async function fetchFacebookProfile(accessToken: string) {
  const version = resolveMetaApiVersion();
  const response = await fetch(
    `https://graph.facebook.com/${version}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'GET',
    },
  );

  if (!response.ok) {
    throw new Error('Unable to fetch Facebook user profile');
  }

  const profile = (await response.json()) as {
    id?: string;
    name?: string;
  };

  return {
    externalId: profile.id ?? null,
    handle: profile.name ?? 'Facebook account',
  };
}

async function fetchInstagramProfile(accessToken: string) {
  const version = resolveMetaApiVersion();
  const response = await fetch(
    `https://graph.facebook.com/${version}/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'GET',
    },
  );

  if (!response.ok) {
    throw new Error('Unable to fetch Instagram business account profile');
  }

  const payload = (await response.json()) as {
    data?: Array<{
      instagram_business_account?: {
        id?: string;
        username?: string;
      };
    }>;
  };

  const matched = payload.data?.find((entry) => !!entry.instagram_business_account?.id)
    ?.instagram_business_account;

  if (matched?.id) {
    return {
      externalId: matched.id,
      handle: matched.username ? `@${matched.username}` : 'Instagram business account',
    };
  }

  return {
    externalId: null,
    handle: 'Instagram account',
  };
}

async function fetchMetaManagedPages(accessToken: string) {
  const version = resolveMetaApiVersion();
  const response = await fetch(
    `https://graph.facebook.com/${version}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'GET',
    },
  );

  if (!response.ok) {
    throw new Error('Unable to fetch Meta managed pages');
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: {
        id?: string;
        username?: string;
      };
    }>;
  };

  return payload.data ?? [];
}

async function resolveMetaPublishingContext(
  provider: 'facebook' | 'instagram',
  userAccessToken: string,
) {
  const pages = await fetchMetaManagedPages(userAccessToken);

  if (provider === 'facebook') {
    const page = pages.find((item) => !!item.id && !!item.access_token);
    if (!page?.id || !page.access_token) {
      throw new Error('Brak zarządzanej strony Facebook z aktywnym access tokenem');
    }

    return {
      externalId: page.id,
      handle: page.name ?? 'Facebook page',
      accessToken: page.access_token,
      refreshToken: undefined,
      expiresAt: undefined,
    };
  }

  const pageWithInstagram = pages.find(
    (item) => !!item.access_token && !!item.instagram_business_account?.id,
  );

  if (!pageWithInstagram?.access_token || !pageWithInstagram.instagram_business_account?.id) {
    throw new Error('Brak konta Instagram Business powiązanego z zarządzaną stroną Facebook');
  }

  return {
    externalId: pageWithInstagram.instagram_business_account.id,
    handle: pageWithInstagram.instagram_business_account.username
      ? `@${pageWithInstagram.instagram_business_account.username}`
      : 'Instagram business account',
    accessToken: pageWithInstagram.access_token,
    refreshToken: undefined,
    expiresAt: undefined,
  };
}

export async function handleOAuthCallback(
  platformInput: string,
  query: OAuthCallbackQuery,
  options?: { tiktokCodeVerifier?: string; reconnectAccountId?: string },
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
      : provider === 'tiktok'
        ? await exchangeTikTokCode(query.code, options?.tiktokCodeVerifier)
        : await exchangeMetaCode(query.code, provider);

  const metaContext =
    provider === 'facebook' || provider === 'instagram'
      ? await resolveMetaPublishingContext(provider, tokenResult.accessToken)
      : null;

  const profile =
    provider === 'youtube'
      ? await fetchGoogleProfile(tokenResult.accessToken)
      : provider === 'tiktok'
        ? await fetchTikTokProfile(tokenResult.accessToken)
        : provider === 'facebook' || provider === 'instagram'
          ? {
              externalId: metaContext?.externalId ?? null,
              handle: metaContext?.handle ?? 'Meta account',
            }
          : await fetchFacebookProfile(tokenResult.accessToken);

  const prismaPlatform = toPrismaPlatform(provider);
  const reconnectAccountId = options?.reconnectAccountId;

  const reconnectTarget = reconnectAccountId
    ? await prisma.socialAccount.findFirst({
        where: {
          id: reconnectAccountId,
          userId: ownerId,
          platform: prismaPlatform,
        },
      })
    : null;

  if (reconnectAccountId && !reconnectTarget) {
    throw new Error('Nie znaleziono konta do ponownej autoryzacji.');
  }

  const existingByExternalId = profile.externalId
    ? await prisma.socialAccount.findFirst({
        where: {
          platform: prismaPlatform,
          externalId: profile.externalId,
        },
      })
    : null;

  if (existingByExternalId && existingByExternalId.userId !== ownerId) {
    throw new Error('To konto social jest już połączone z innym użytkownikiem.');
  }

  const existingOwnedByExternal =
    existingByExternalId && existingByExternalId.userId === ownerId
      ? existingByExternalId
      : null;

  const accountToUpdate = reconnectTarget ?? existingOwnedByExternal;
  const updateReason = reconnectTarget
    ? 'reconnect'
    : existingOwnedByExternal
      ? 'already-connected'
      : 'new-account';

  const accessTokenToStore = metaContext?.accessToken ?? tokenResult.accessToken;
  const refreshTokenToStore = metaContext?.refreshToken ?? tokenResult.refreshToken;
  const expiresAtToStore = metaContext?.expiresAt ?? tokenResult.expiresAt;

  const encryptedAccessToken = encrypt(accessTokenToStore);
  const encryptedRefreshToken = refreshTokenToStore
    ? encrypt(refreshTokenToStore)
    : accountToUpdate?.refreshToken;

  const saved = accountToUpdate
    ? await prisma.socialAccount.update({
        where: { id: accountToUpdate.id },
        data: {
          userId: ownerId,
          platform: prismaPlatform,
          handle: profile.handle,
          externalId: profile.externalId,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: expiresAtToStore,
        },
      })
    : await (async () => {
        await assertSocialAccountsLimit(ownerId);
        return prisma.socialAccount.create({
          data: {
            userId: ownerId,
            platform: prismaPlatform,
            handle: profile.handle,
            externalId: profile.externalId,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt: expiresAtToStore,
          },
        });
      })();

  return {
    success: true,
    platform: provider,
    accountId: saved.id,
    handle: saved.handle,
    message:
      updateReason === 'reconnect'
        ? `Konto ${
            provider === 'youtube'
              ? 'YouTube'
              : provider === 'tiktok'
                ? 'TikTok'
                : provider === 'facebook'
                  ? 'Facebook'
                  : 'Instagram'
          } zostało ponownie autoryzowane.`
        : updateReason === 'already-connected'
        ? `To konto ${
            provider === 'youtube'
              ? 'YouTube'
              : provider === 'tiktok'
                ? 'TikTok'
                : provider === 'facebook'
                  ? 'Facebook'
                  : 'Instagram'
          } było już połączone. Dane autoryzacji zostały odświeżone.`
        : `Konto ${
            provider === 'youtube'
              ? 'YouTube'
              : provider === 'tiktok'
                ? 'TikTok'
                : provider === 'facebook'
                  ? 'Facebook'
                  : 'Instagram'
          } połączone!`,
  };
}

export function decryptToken(value?: string | null) {
  if (!value) {
    return undefined;
  }

  return decrypt(value);
}

export async function refreshSocialAccessToken(accountId: string) {
  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      platform: true,
      accessToken: true,
      refreshToken: true,
    },
  });

  if (!account) {
    throw new Error('Social account not found for token refresh');
  }

  const decryptedRefreshToken = decryptToken(account.refreshToken);
  const decryptedAccessToken = decryptToken(account.accessToken);

  const tokenResult = await (
    account.platform === 'YOUTUBE'
      ? (() => {
          if (!decryptedRefreshToken) {
            throw new Error('Brak refresh token dla konta social');
          }

          return refreshGoogleToken(decryptedRefreshToken);
        })()
      : account.platform === 'TIKTOK'
        ? (() => {
            if (!decryptedRefreshToken) {
              throw new Error('Brak refresh token dla konta social');
            }

            return refreshTikTokToken(decryptedRefreshToken);
          })()
        : account.platform === 'FACEBOOK'
          ? (() => {
              if (!decryptedAccessToken) {
                throw new Error('Brak access token dla konta social');
              }

              return refreshMetaToken(decryptedAccessToken, 'facebook');
            })()
          : account.platform === 'INSTAGRAM'
            ? (() => {
                if (!decryptedAccessToken) {
                  throw new Error('Brak access token dla konta social');
                }

                return refreshMetaToken(decryptedAccessToken, 'instagram');
              })()
        : (() => {
            throw new Error(`Refresh token nieobsługiwany dla platformy ${account.platform}`);
              })()
      );

  const encryptedAccessToken = encrypt(tokenResult.accessToken);
  const encryptedRefreshToken = tokenResult.refreshToken
    ? encrypt(tokenResult.refreshToken)
    : account.refreshToken;

  await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      expiresAt: tokenResult.expiresAt,
    },
  });

  return {
    accessToken: tokenResult.accessToken,
    expiresAt: tokenResult.expiresAt,
  };
}
