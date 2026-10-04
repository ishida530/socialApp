import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { decrypt, encrypt } from './crypto';
import { prisma } from './prisma';
import { assertSocialAccountsLimit } from './subscription';

type OAuthProvider = 'youtube' | 'tiktok' | 'facebook' | 'instagram' | 'linkedin';
type PrismaPlatform = 'YOUTUBE' | 'TIKTOK' | 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN';

type TokenResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
};

// Errors whose message is safe AND useful to show the user on the /callback page (2026-09-30).
// Everything else collapses to a generic "try again" in the callback route, because raw provider
// errors can carry token/crypto details - but a new user stuck on "no Instagram Business account
// linked to your Page" must be told exactly that, or they have no way to fix it themselves.
export class OAuthUserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthUserFacingError';
  }
}

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

  if (normalized === 'linkedin') {
    return 'linkedin';
  }

  throw new Error('Unsupported platform. Use youtube, tiktok, facebook, instagram or linkedin.');
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

// Only scopes the app actually uses (TikTok audit: "request only the scopes you use", 2026-09-30):
//   user.info.basic - open_id + display_name on connect (fetchTikTokProfile)
//   video.publish   - Direct Post (publish-processor)
//   user.info.stats - follower_count (account-growth)
// Not requested anymore: user.info.profile (no profile field is read), video.upload (inbox
// upload - Postfly only uses Direct Post) and video.list (2026-10-04: it only returns PUBLIC
// videos, while an unaudited app can post only "Only me" to a private account - it could not be
// demonstrated for review; add it back after the audit together with TikTok post statistics).
const DEFAULT_TIKTOK_SCOPES = 'user.info.basic,video.publish,user.info.stats';

function resolveTikTokScope() {
  const rawScope = process.env.TIKTOK_OAUTH_SCOPES || DEFAULT_TIKTOK_SCOPES;
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
  // EPIC 11 Sprint 11.2 (2026-09-14): pages_manage_engagement added - required to reply to
  // comments on Page posts (pages_read_engagement only covers reading). Confirmed via the app's
  // own Meta App Review "New requests" list, not guessed. An account connected BEFORE this
  // change needs to be reconnected (Ustawienia -> Konta social -> rozłącz/połącz ponownie) to
  // get a token that actually carries the new scope.
  return (
    process.env.FACEBOOK_OAUTH_SCOPES ||
    // No 'email' (2026-10-03, Meta review audit): nothing reads it, and Meta rejects unused permissions.
    'public_profile,pages_show_list,pages_read_engagement,pages_manage_engagement,pages_manage_posts,business_management'
  );
}

function resolveLinkedInApiVersion() {
  return process.env.LINKEDIN_API_VERSION || '202401';
}

function resolveLinkedInScope() {
  // Profil osobisty, nie strona firmowa (patrz komentarz przy enum Platform w schema.prisma):
  // 'openid,profile,email' to "Sign In with LinkedIn using OpenID Connect" (tożsamość -
  // potrzebne do pobrania URN autora dla publikacji), 'w_member_social' to "Share on LinkedIn"
  // (publikacja) - oba produkty samoobsługowe, bez recenzji LinkedIn.
  return process.env.LINKEDIN_OAUTH_SCOPES || 'openid,profile,email,w_member_social';
}

function resolveInstagramScope() {
  // EPIC 11 Sprint 11.2 (2026-09-14): instagram_manage_comments added - required to read/reply
  // to comments on IG media (instagram_basic alone does not cover comments). Same reconnect
  // requirement as Facebook above.
  return (
    process.env.INSTAGRAM_OAUTH_SCOPES ||
    'instagram_basic,instagram_content_publish,instagram_manage_comments,pages_show_list,pages_read_engagement,pages_manage_posts,business_management'
  );
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

  if (provider === 'linkedin') {
    return 'LINKEDIN';
  }

  return 'INSTAGRAM';
}

// Comment-reply permissions (2026-10-02) wait for Meta App Review: requesting a permission
// without Advanced access breaks the consent screen for regular users, while the admin who
// records the review demo and the reviewers' test accounts need it (Meta also requires a
// successful test API call with it before "Request advanced access" unlocks). The caller passes
// commentsFeatureEnabledFor(email), so the scope list follows the same switch as the UI.
// pages_read_user_content (2026-10-03): Meta's comments guide requires it next to
// pages_manage_engagement to read other people's comments (author name) on Page posts.
const META_COMMENT_SCOPES = ['pages_manage_engagement', 'pages_read_user_content', 'instagram_manage_comments'];
const META_COMMENT_SCOPE_BY_PROVIDER = {
  facebook: ['pages_manage_engagement', 'pages_read_user_content'],
  instagram: ['instagram_manage_comments'],
} as const;

export function applyCommentScopes(
  scope: string,
  provider: 'facebook' | 'instagram',
  includeCommentScopes: boolean,
) {
  const scopes = scope
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry && !META_COMMENT_SCOPES.includes(entry));

  if (includeCommentScopes) {
    scopes.push(...META_COMMENT_SCOPE_BY_PROVIDER[provider]);
  }

  return scopes.join(',');
}

export function buildAuthUrl(
  platformInput: string,
  userId: string,
  options: { includeCommentScopes?: boolean } = {},
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
      scope: applyCommentScopes(
        provider === 'facebook' ? resolveFacebookScope() : resolveInstagramScope(),
        provider,
        options.includeCommentScopes ?? false,
      ),
    });

    return {
      url: `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`,
    };
  }

  if (provider === 'linkedin') {
    const params = new URLSearchParams({
      client_id: requireConfig('LINKEDIN_CLIENT_ID'),
      redirect_uri: requireConfig('LINKEDIN_REDIRECT_URI'),
      response_type: 'code',
      state,
      scope: resolveLinkedInScope(),
    });

    return {
      url: `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`,
    };
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_key: requireAnyConfig(['TIKTOK_KEY', 'TIKTOK_CLIENT_ID']),
    response_type: 'code',
    redirect_uri: requireConfig('TIKTOK_REDIRECT_URI'),
    scope: resolveTikTokScope(),
    disable_auto_auth: '1',
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

  // The code exchange only yields a SHORT-lived user token (~1-2h), and a Page token read through
  // /me/accounts with it is itself valid for just 1 hour (Meta docs, "token-switch"). Exchanging for
  // a long-lived user token first is the documented way to get Page tokens that don't expire - so
  // connected Facebook Pages / Instagram accounts stop silently breaking an hour after connecting.
  return exchangeForLongLivedMetaUserToken(tokenJson.access_token, provider);
}

async function exchangeForLongLivedMetaUserToken(
  userAccessToken: string,
  provider: 'facebook' | 'instagram',
): Promise<TokenResult> {
  const version = resolveMetaApiVersion();
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: resolveMetaClientId(provider),
    client_secret: resolveMetaClientSecret(provider),
    fb_exchange_token: userAccessToken,
  });

  const response = await fetch(`https://graph.facebook.com/${version}/oauth/access_token?${params.toString()}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Meta long-lived token exchange failed: ${errorBody || response.statusText}`);
  }

  const tokenJson = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!tokenJson.access_token) {
    throw new Error('Meta long-lived token exchange failed: missing access_token');
  }

  return {
    accessToken: tokenJson.access_token,
    // The long-lived USER token is what later refreshes re-derive the Page token from (see
    // refreshMetaToken) - the Page token itself is not a documented fb_exchange_token input.
    refreshToken: tokenJson.access_token,
    expiresAt: tokenJson.expires_in ? new Date(Date.now() + tokenJson.expires_in * 1000) : undefined,
  };
}

async function exchangeLinkedInCode(code: string): Promise<TokenResult> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: requireConfig('LINKEDIN_CLIENT_ID'),
    client_secret: requireConfig('LINKEDIN_CLIENT_SECRET'),
    redirect_uri: requireConfig('LINKEDIN_REDIRECT_URI'),
  });

  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LinkedIn token exchange failed: ${errorBody || response.statusText}`);
  }

  const tokenJson = (await response.json()) as {
    access_token?: string;
    // Domyślne aplikacje LinkedIn NIE dostają refresh_token (tylko access token ważny ~60 dni) -
    // ten produkt ("Refresh Token behavior") wymaga osobnej, dodatkowej zgody LinkedIn. Pole
    // opcjonalne właśnie dlatego, nie przez pomyłkę.
    refresh_token?: string;
    expires_in?: number;
  };

  if (!tokenJson.access_token) {
    throw new Error('LinkedIn token exchange failed: missing access_token');
  }

  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
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

// Re-derives the Page token (Facebook) / Page token behind the Instagram Business account from the
// stored long-lived USER token (kept in `refreshToken` since 2026-09-30). Page tokens obtained this
// way don't expire, so this mostly matters for accounts connected before that change, whose stored
// Page token came from a short-lived user token.
async function refreshMetaToken(
  userToken: string,
  provider: 'facebook' | 'instagram',
  externalId: string | null,
): Promise<TokenResult> {
  // The stored user token is already the long-lived one (~60 days) - /me/accounts works with it
  // directly; re-running fb_exchange_token on an already long-lived token isn't a documented input.
  const pages = await fetchMetaManagedPages(userToken);

  const page =
    provider === 'facebook'
      ? pages.find((item) => item.id === externalId && item.access_token)
      : pages.find((item) => item.instagram_business_account?.id === externalId && item.access_token);

  if (!page?.access_token) {
    throw new Error('Meta token refresh failed: connected Page no longer available for this user token');
  }

  return {
    accessToken: page.access_token,
    refreshToken: userToken,
    expiresAt: undefined,
  };
}

async function refreshLinkedInToken(refreshToken: string): Promise<TokenResult> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: requireConfig('LINKEDIN_CLIENT_ID'),
    client_secret: requireConfig('LINKEDIN_CLIENT_SECRET'),
  });

  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LinkedIn token refresh failed: ${errorBody || response.statusText}`);
  }

  const tokenJson = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!tokenJson.access_token) {
    throw new Error('LinkedIn token refresh failed: missing access_token');
  }

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

// OpenID Connect userinfo - zastąpiło stare /v2/me (wymagało osobnego, dziś niedostępnego
// scope'u r_liteprofile dla nowych aplikacji). `sub` to surowe ID członka LinkedIn - zapisywane
// jako externalId, żeby publish-processor mógł zbudować URN autora ("urn:li:person:{sub}") bez
// dodatkowego wywołania API przy każdej publikacji.
async function fetchLinkedInProfile(accessToken: string) {
  const response = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Unable to fetch LinkedIn user profile');
  }

  const profile = (await response.json()) as {
    sub?: string;
    name?: string;
  };

  return {
    externalId: profile.sub ?? null,
    handle: profile.name ?? 'LinkedIn account',
  };
}

async function fetchMetaManagedPages(accessToken: string) {
  const version = resolveMetaApiVersion();
  const response = await fetch(
    `https://graph.facebook.com/${version}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(accessToken)}`,
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

// 2026-09-25 (multi-account): one Facebook user often manages several pages - e.g. an agency owner
// who manages their own page AND a customer's page, each connected to a DIFFERENT Postfly account.
// Taking simply the first page from /me/accounts picked the owner's own page (already connected to
// the owner's Postfly account -> "already connected to another user") when connecting from the
// customer's account. Rank candidates instead: this account's own previously connected page first,
// then pages not connected to any Postfly account, never a page that belongs to another account.
async function rankMetaCandidates<T>(
  ownerId: string,
  platform: 'FACEBOOK' | 'INSTAGRAM',
  candidates: T[],
  externalIdOf: (candidate: T) => string,
): Promise<T[]> {
  const ids = candidates.map(externalIdOf);
  const connected = await prisma.socialAccount.findMany({
    where: { platform, externalId: { in: ids } },
    select: { externalId: true, userId: true },
  });
  const ownerOf = new Map(connected.map((account) => [account.externalId, account.userId]));

  const mine = candidates.filter((c) => ownerOf.get(externalIdOf(c)) === ownerId);
  const free = candidates.filter((c) => !ownerOf.has(externalIdOf(c)));
  return [...mine, ...free];
}

async function resolveMetaPublishingContext(
  provider: 'facebook' | 'instagram',
  userAccessToken: string,
  ownerId: string,
) {
  const pages = await fetchMetaManagedPages(userAccessToken);

  if (provider === 'facebook') {
    const withToken = pages.filter((item) => !!item.id && !!item.access_token);
    const [page] = await rankMetaCandidates(ownerId, 'FACEBOOK', withToken, (item) => item.id!);
    if (withToken.length > 0 && !page) {
      throw new OAuthUserFacingError(
        'Wszystkie strony Facebook tego konta są już połączone z innymi kontami Postfly. W oknie Facebooka wybierz stronę, którą chcesz podłączyć (Edytuj ustawienia).',
      );
    }
    if (!page?.id || !page.access_token) {
      throw new OAuthUserFacingError(
        'Nie znaleziono strony Facebook, którą zarządzasz. Postfly publikuje na Stronach Facebook (nie na profilu prywatnym) - utwórz Stronę albo w oknie Facebooka zaznacz ją przy udzielaniu dostępu (Edytuj ustawienia).',
      );
    }

    return {
      externalId: page.id,
      handle: page.name ?? 'Facebook page',
      accessToken: page.access_token,
      refreshToken: undefined,
      expiresAt: undefined,
    };
  }

  const withInstagram = pages.filter((item) => !!item.access_token && !!item.instagram_business_account?.id);
  const [pageWithInstagram] = await rankMetaCandidates(
    ownerId,
    'INSTAGRAM',
    withInstagram,
    (item) => item.instagram_business_account!.id!,
  );
  if (withInstagram.length > 0 && !pageWithInstagram) {
    throw new OAuthUserFacingError(
      'Wszystkie konta Instagram Business tego konta Facebook są już połączone z innymi kontami Postfly. W oknie Facebooka wybierz właściwą stronę (Edytuj ustawienia).',
    );
  }

  if (!pageWithInstagram?.access_token || !pageWithInstagram.instagram_business_account?.id) {
    throw new OAuthUserFacingError(
      'Nie znaleziono konta Instagram firmowego lub twórcy połączonego ze Stroną Facebook. W aplikacji Instagram przełącz konto na profesjonalne i połącz je ze swoją Stroną Facebook, a potem spróbuj ponownie (w oknie Facebooka zaznacz tę Stronę i konto Instagram).',
    );
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
    // access_denied / user_cancelled etc. - the user closed or declined the provider's consent
    // screen. Nothing broke; say so instead of a generic failure.
    const cancelled = /denied|cancel/i.test(query.error);
    throw new OAuthUserFacingError(
      cancelled
        ? 'Anulowano łączenie konta - nie udzielono dostępu. Możesz spróbować ponownie w każdej chwili.'
        : 'Serwis odrzucił autoryzację. Spróbuj ponownie, a jeśli problem wraca, napisz do nas.',
    );
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
        : provider === 'linkedin'
          ? await exchangeLinkedInCode(query.code)
          : await exchangeMetaCode(query.code, provider);

  const metaContext =
    provider === 'facebook' || provider === 'instagram'
      ? await resolveMetaPublishingContext(provider, tokenResult.accessToken, ownerId)
      : null;

  const profile =
    provider === 'youtube'
      ? await fetchGoogleProfile(tokenResult.accessToken)
      : provider === 'tiktok'
        ? await fetchTikTokProfile(tokenResult.accessToken)
        : provider === 'linkedin'
          ? await fetchLinkedInProfile(tokenResult.accessToken)
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
    throw new OAuthUserFacingError('Nie znaleziono konta do ponownej autoryzacji.');
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
    throw new OAuthUserFacingError(
      'To konto jest już połączone z innym kontem Postfly. Najpierw odłącz je tam albo zaloguj się w oknie autoryzacji na inne konto.',
    );
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
  // Meta: the stored token is a Page token derived from a long-lived user token - it has no expiry
  // (null), which also keeps refreshAllExpiringTokens from pointlessly "refreshing" it.
  const expiresAtToStore = metaContext ? null : tokenResult.expiresAt;

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
        try {
          await assertSocialAccountsLimit(ownerId);
        } catch (error) {
          // Only the plan-limit message is meant for the user - anything else (DB errors...) stays
          // internal and ends up as the generic callback message.
          if (error instanceof Error && error.message.startsWith('Przekroczono limit planu')) {
            throw new OAuthUserFacingError(`${error.message} Odłącz nieużywane konto albo zmień plan.`);
          }
          throw error;
        }
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

  const displayName: Record<OAuthProvider, string> = {
    youtube: 'YouTube',
    tiktok: 'TikTok',
    facebook: 'Facebook',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
  };

  return {
    success: true,
    platform: provider,
    accountId: saved.id,
    handle: saved.handle,
    message:
      updateReason === 'reconnect'
        ? `Konto ${displayName[provider]} zostało ponownie autoryzowane.`
        : updateReason === 'already-connected'
          ? provider === 'tiktok'
            ? 'To konto TikTok było już połączone. Dane autoryzacji zostały odświeżone. Aby dodać kolejne konto, zaloguj w oknie autoryzacji inne konto TikTok (ew. tryb incognito / wylogowanie z obecnego konta).'
            : `To konto ${displayName[provider]} było już połączone. Dane autoryzacji zostały odświeżone.`
          : `Konto ${displayName[provider]} połączone!`,
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
      externalId: true,
    },
  });

  if (!account) {
    throw new Error('Social account not found for token refresh');
  }

  const decryptedRefreshToken = decryptToken(account.refreshToken);

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
              if (!decryptedRefreshToken) {
                throw new Error('Brak refresh token dla konta social');
              }

              return refreshMetaToken(decryptedRefreshToken, 'facebook', account.externalId);
            })()
          : account.platform === 'INSTAGRAM'
            ? (() => {
                if (!decryptedRefreshToken) {
                  throw new Error('Brak refresh token dla konta social');
                }

                return refreshMetaToken(decryptedRefreshToken, 'instagram', account.externalId);
              })()
            : account.platform === 'LINKEDIN'
              ? (() => {
                  // Domyślne aplikacje LinkedIn nie dostają refresh_token (patrz komentarz przy
                  // exchangeLinkedInCode) - bez niego token po prostu wygasa po ~60 dniach i
                  // konto wymaga ręcznego ponownego połączenia, ten sam ogólny mechanizm co dla
                  // każdego innego wygasłego tokenu (PublishAuthError -> powiadomienie o
                  // konieczności ponownej autoryzacji).
                  if (!decryptedRefreshToken) {
                    throw new Error('Brak refresh token dla konta social');
                  }

                  return refreshLinkedInToken(decryptedRefreshToken);
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
      // null (not undefined, which Prisma would skip) for Meta's non-expiring Page tokens, so a
      // stale past expiresAt doesn't keep re-triggering this refresh on every run.
      expiresAt: tokenResult.expiresAt ?? null,
    },
  });

  return {
    accessToken: tokenResult.accessToken,
    expiresAt: tokenResult.expiresAt,
  };
}

export async function refreshAllExpiringTokens(hoursAhead = 24) {
  const now = new Date();
  const threshold = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  const expiringAccounts = await prisma.socialAccount.findMany({
    where: {
      expiresAt: {
        not: null,
        lte: threshold,
      },
    },
    select: {
      id: true,
      userId: true,
      platform: true,
      handle: true,
      expiresAt: true,
    },
    orderBy: {
      expiresAt: 'asc',
    },
  });

  if (expiringAccounts.length === 0) {
    console.info('[oauth-refresh] no-expiring-accounts', {
      hoursAhead,
      threshold: threshold.toISOString(),
    });

    return {
      scanned: 0,
      refreshed: 0,
      failed: 0,
      threshold: threshold.toISOString(),
      results: [] as Array<{
        accountId: string;
        platform: PrismaPlatform;
        status: 'success' | 'failed';
        expiresAt: string | null;
        newExpiresAt?: string | null;
        error?: string;
      }>,
    };
  }

  const results = await Promise.all(
    expiringAccounts.map(async (account) => {
      try {
        const refreshed = await refreshSocialAccessToken(account.id);

        console.info('[oauth-refresh] token-refreshed', {
          accountId: account.id,
          userId: account.userId,
          platform: account.platform,
          expiresAt: account.expiresAt?.toISOString() ?? null,
          newExpiresAt: refreshed.expiresAt?.toISOString() ?? null,
        });

        return {
          accountId: account.id,
          platform: account.platform,
          status: 'success' as const,
          expiresAt: account.expiresAt?.toISOString() ?? null,
          newExpiresAt: refreshed.expiresAt?.toISOString() ?? null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown token refresh error';

        console.error('[oauth-refresh] token-refresh-failed', {
          accountId: account.id,
          userId: account.userId,
          platform: account.platform,
          expiresAt: account.expiresAt?.toISOString() ?? null,
          error: message,
        });

        return {
          accountId: account.id,
          platform: account.platform,
          status: 'failed' as const,
          expiresAt: account.expiresAt?.toISOString() ?? null,
          error: message,
        };
      }
    }),
  );

  const refreshed = results.filter((result) => result.status === 'success').length;
  const failed = results.length - refreshed;

  console.info('[oauth-refresh] batch-finished', {
    scanned: results.length,
    refreshed,
    failed,
    threshold: threshold.toISOString(),
  });

  return {
    scanned: results.length,
    refreshed,
    failed,
    threshold: threshold.toISOString(),
    results,
  };
}

// Disconnect (2026-10-01): revoke the platform grant, not just forget the token locally.
// YouTube API Services Developer Policies: "the API Client must programmatically revoke that token
// right away" when a user revokes authorization in the client. TikTok offers the same endpoint.
// Meta is deliberately excluded: DELETE /me/permissions would remove the app for the whole Facebook
// user, including Pages connected to OTHER Postfly accounts (agency case). Best-effort - a failed
// revoke never blocks the disconnect itself.
export async function revokeSocialAccountGrant(account: {
  platform: string;
  accessToken: string | null;
  refreshToken: string | null;
}) {
  try {
    if (account.platform === 'YOUTUBE') {
      // Revoking the refresh token revokes the whole grant (and its access tokens).
      const token = decryptToken(account.refreshToken) ?? decryptToken(account.accessToken);
      if (!token) return;
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString(),
      });
      return;
    }

    if (account.platform === 'TIKTOK') {
      const token = decryptToken(account.accessToken);
      if (!token) return;
      await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: requireAnyConfig(['TIKTOK_KEY', 'TIKTOK_CLIENT_ID']),
          client_secret: requireAnyConfig(['TIKTOK_SECRET', 'TIKTOK_CLIENT_SECRET']),
          token,
        }).toString(),
      });
    }
  } catch (error) {
    console.error('[social-oauth] revoke on disconnect failed', { platform: account.platform, error });
  }
}
