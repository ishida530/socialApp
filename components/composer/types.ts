export type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';

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
};

export const PLATFORM_CAPTION_LIMIT: Record<Platform, number> = {
  YOUTUBE: 5000,
  TIKTOK: 2200,
  INSTAGRAM: 2200,
  FACEBOOK: 63206,
};
