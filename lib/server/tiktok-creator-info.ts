import { prisma } from './prisma';
import { decryptToken, refreshSocialAccessToken } from './social-oauth';

export type TikTokCreatorInfo = {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
};

type TikTokCreatorInfoResponse = {
  data?: TikTokCreatorInfo;
  error?: {
    code?: string | number;
    message?: string;
    log_id?: string;
  };
};

// TikTok Content Sharing Guidelines, "Required UX Implementation" 1b (2026-09-30, audit rejection
// ref 20260913074631): "When the creator_info API returns that the creator can not make more posts
// at this moment, API Clients must stop the current publishing attempt and prompt users to try
// again later." TikTok signals that through `error.code` (anything other than "ok"), sometimes with
// an HTTP 200 - the previous version only looked at `response.ok` and silently returned `data`.
export class TikTokCreatorCannotPostError extends Error {
  constructor(
    public readonly code: string,
    public readonly userMessage: string,
  ) {
    super(`TikTok creator cannot post right now: ${code}`);
    this.name = 'TikTokCreatorCannotPostError';
  }
}

const CANNOT_POST_MESSAGES: Record<string, string> = {
  spam_risk_too_many_posts:
    'To konto TikTok osiągnęło dzienny limit publikacji przez API. Spróbuj ponownie później.',
  spam_risk_user_banned_from_posting:
    'TikTok tymczasowo zablokował publikowanie na tym koncie. Spróbuj ponownie później.',
  reached_active_user_cap:
    'Dzienny limit twórców publikujących przez Postfly na TikToku został osiągnięty. Spróbuj ponownie później.',
  unaudited_client_can_only_post_to_private_accounts:
    'To konto TikTok musi być prywatne, dopóki aplikacja Postfly nie przejdzie audytu TikToka.',
};

// Auth-type failures are a reconnect/refresh problem, not a "try again later" one - the publish
// processor maps this to its PublishAuthError (token refresh + retry, or the permanent
// [oauth-scope-missing] tag), the composer routes to a generic "couldn't load" message.
const AUTH_ERROR_CODES = new Set(['access_token_invalid', 'scope_not_authorized', 'scope_permission_missed']);

export class TikTokCreatorInfoAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TikTokCreatorInfoAuthError';
  }
}

// Only the documented "this creator can't post right now" states. Transient API problems
// (rate_limit_exceeded, internal_error, 5xx) are NOT that - reporting them as "can't post" would
// block the whole composer (and every settings save) for what is a retry-in-a-second blip.
function isCannotPostCode(code: string) {
  return code.startsWith('spam_risk') || code === 'reached_active_user_cap' || code.startsWith('unaudited_client');
}

export function tiktokCannotPostMessage(code: string) {
  return (
    CANNOT_POST_MESSAGES[code] ??
    'TikTok nie pozwala teraz publikować na tym koncie. Spróbuj ponownie później.'
  );
}

export async function queryTikTokCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({}),
  });

  const rawBody = await response.text();
  let payload: TikTokCreatorInfoResponse | null = null;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as TikTokCreatorInfoResponse) : null;
  } catch {
    payload = null;
  }

  const errorCode = payload?.error?.code !== undefined ? String(payload.error.code) : undefined;

  if (errorCode && isCannotPostCode(errorCode)) {
    throw new TikTokCreatorCannotPostError(errorCode, tiktokCannotPostMessage(errorCode));
  }

  if ((errorCode && AUTH_ERROR_CODES.has(errorCode)) || response.status === 401 || response.status === 403) {
    throw new TikTokCreatorInfoAuthError(
      `TikTok creator info auth failed: ${rawBody || response.statusText}`,
      response.status === 403 ? 403 : 401,
    );
  }

  if (!response.ok || (errorCode && errorCode !== 'ok')) {
    throw new Error(`TikTok creator info query failed: ${rawBody || response.statusText}`);
  }

  return payload?.data ?? {};
}

async function resolveTikTokAccessToken(accountId: string) {
  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      platform: true,
      accessToken: true,
      expiresAt: true,
    },
  });

  if (!account || account.platform !== 'TIKTOK') {
    throw new Error('Brak poprawnego konta TikTok do walidacji publikacji');
  }

  let accessToken = decryptToken(account.accessToken);
  if (!accessToken || (account.expiresAt && account.expiresAt.getTime() <= Date.now() + 30_000)) {
    const refreshed = await refreshSocialAccessToken(account.id);
    accessToken = refreshed.accessToken;
  }

  if (!accessToken) {
    throw new Error('Brak tokenu TikTok do pobrania creator info');
  }

  return accessToken;
}

export async function fetchTikTokCreatorInfo(accountId: string) {
  const accessToken = await resolveTikTokAccessToken(accountId);
  return queryTikTokCreatorInfo(accessToken);
}
