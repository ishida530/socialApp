import { createHmac, timingSafeEqual } from 'crypto';
import { OAuth2Client } from 'google-auth-library';

type GoogleLoginConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
};

function requireConfig(key: string) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required config: ${key}`);
  }

  return value;
}

function resolveFrontendUrl() {
  return process.env.FRONTEND_URL ?? 'http://localhost:3000';
}

export function resolveGoogleLoginConfig(): GoogleLoginConfig {
  const clientId = process.env.GOOGLE_LOGIN_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_LOGIN_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_LOGIN_REDIRECT_URI ?? `${resolveFrontendUrl()}/api/auth/google/callback`;

  if (!clientId) {
    throw new Error('Missing required config: GOOGLE_LOGIN_CLIENT_ID (or GOOGLE_CLIENT_ID)');
  }

  if (!clientSecret) {
    throw new Error('Missing required config: GOOGLE_LOGIN_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET)');
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

function createGoogleOAuthClient() {
  const { clientId, clientSecret, redirectUri } = resolveGoogleLoginConfig();
  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri,
  });
}

type OAuthStatePayload = {
  nonce: string;
  exp: number;
};

function signPayload(payloadEncoded: string) {
  return createHmac('sha256', requireConfig('OAUTH_STATE_SECRET'))
    .update(payloadEncoded)
    .digest('base64url');
}

export function createGoogleLoginState() {
  const payload: OAuthStatePayload = {
    nonce: crypto.randomUUID(),
    exp: Date.now() + 10 * 60 * 1000,
  };

  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(payloadEncoded);

  return `${payloadEncoded}.${signature}`;
}

export function verifyGoogleLoginState(state: string) {
  const [payloadEncoded, signature] = state.split('.');
  if (!payloadEncoded || !signature) {
    throw new Error('Invalid Google OAuth state payload');
  }

  const expectedSignature = signPayload(payloadEncoded);
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const providedBuffer = Buffer.from(signature, 'utf8');

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new Error('Invalid Google OAuth state signature');
  }

  const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8')) as OAuthStatePayload;
  if (!payload.exp || Date.now() > payload.exp) {
    throw new Error('Google OAuth state expired');
  }
}

export function buildGoogleLoginUrl(state: string) {
  const client = createGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
    state,
  });
}

export async function exchangeGoogleCodeForLogin(code: string) {
  const client = createGoogleOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token) {
    throw new Error('Google token exchange failed: missing access token');
  }

  return {
    access_token: tokens.access_token,
    expires_in: tokens.expiry_date
      ? Math.max(0, Math.floor((tokens.expiry_date - Date.now()) / 1000))
      : undefined,
    refresh_token: tokens.refresh_token ?? undefined,
    scope: tokens.scope ?? undefined,
    token_type: tokens.token_type ?? undefined,
    id_token: tokens.id_token ?? undefined,
  } satisfies GoogleTokenResponse;
}

export async function fetchGoogleUserInfo(accessToken: string, idToken?: string) {
  const client = createGoogleOAuthClient();

  if (idToken) {
    const ticket = await client.verifyIdToken({ idToken });
    const payload = ticket.getPayload();

    const email = payload?.email?.trim().toLowerCase();
    if (!email) {
      throw new Error('Google ID token does not include email');
    }

    return {
      sub: payload?.sub ?? email,
      email,
      email_verified: payload?.email_verified,
      name: payload?.name,
      given_name: payload?.given_name,
      picture: payload?.picture,
    } satisfies GoogleUserInfo;
  }

  const tokenInfo = await client.getTokenInfo(accessToken);

  if (!tokenInfo.email) {
    throw new Error('Google token does not include email scope');
  }

  const email = tokenInfo.email.trim().toLowerCase();

  return {
    sub: tokenInfo.sub ?? email,
    email,
    email_verified: tokenInfo.email_verified,
    name: undefined,
    given_name: undefined,
    picture: undefined,
  } satisfies GoogleUserInfo;
}
