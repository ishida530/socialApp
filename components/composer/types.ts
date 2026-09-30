export type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN';

export type SocialAccountDto = {
  id: string;
  platform: Platform;
  handle: string;
};

export type DraftJob = {
  id: string;
  status: 'DRAFT' | 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
  postGroupId: string;
  caption: string;
  hashtags: string[];
  title: string | null;
  mentions: string[];
  isExplicit: boolean | null;
  contentWarnings: string[];
  tiktokPrivacyLevel: string | null;
  tiktokAllowComment: boolean | null;
  tiktokAllowDuet: boolean | null;
  tiktokAllowStitch: boolean | null;
  tiktokConsentAt: string | null;
  tiktokDisclosureEnabled: boolean | null;
  tiktokBrandOrganic: boolean | null;
  tiktokBrandedContent: boolean | null;
  metaPostFormat: string | null;
  scheduledFor: string;
  publishedAt: string | null;
  remotePostId: string | null;
  remotePostUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  videoId: string;
  socialAccountId: string;
  video: {
    id: string;
    title: string;
    sourceUrl: string;
    thumbnailUrl: string | null;
    mediaType: 'VIDEO' | 'IMAGE';
    durationSec: number | null;
  };
  socialAccount: SocialAccountDto;
};

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

export const PLATFORM_LABEL: Record<Platform, string> = {
  YOUTUBE: 'YouTube',
  TIKTOK: 'TikTok',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  LINKEDIN: 'LinkedIn',
};

export const PLATFORM_CAPTION_LIMIT: Record<Platform, number> = {
  YOUTUBE: 5000,
  TIKTOK: 2200,
  INSTAGRAM: 2200,
  FACEBOOK: 63206,
  LINKEDIN: 3000,
};

export type TikTokCreatorInfoResponse = {
  account: { id: string; handle: string };
  creatorInfo: TikTokCreatorInfo | null;
  canPost: boolean;
  cannotPostReason: string | null;
};

// Readable labels for TikTok's privacy_level_options values. The options themselves always come
// from creator_info (guideline 2b) - this only translates the values TikTok documents.
export const TIKTOK_PRIVACY_LABEL: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Wszyscy (Everyone)',
  MUTUAL_FOLLOW_FRIENDS: 'Znajomi (Friends)',
  FOLLOWER_OF_CREATOR: 'Obserwujący (Followers)',
  SELF_ONLY: 'Tylko ja (Only me)',
};

export const TIKTOK_MUSIC_USAGE_URL = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
export const TIKTOK_BRANDED_CONTENT_POLICY_URL = 'https://www.tiktok.com/legal/page/global/bc-policy/en';
