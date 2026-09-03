import { prisma } from './prisma';
import { decryptToken, refreshSocialAccessToken } from './social-oauth';

export type TikTokCreatorInfo = {
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
  };
};

export async function fetchTikTokCreatorInfo(accountId: string) {
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

  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`TikTok creator info query failed: ${errorBody || response.statusText}`);
  }

  const payload = (await response.json()) as TikTokCreatorInfoResponse;
  return payload.data;
}
