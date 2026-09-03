export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'facebook';

export interface PostContent {
  mediaUrl: string;
  descriptions: Record<Platform, string>;
  tags: string[];
}

export interface ScheduledPost {
  id: string;
  campaignId: string;
  platform: Platform;
  scheduledTime: string;
  status: 'pending' | 'published' | 'failed' | 'suggested';
  remotePostUrl?: string;
}

export type SmartSlotReason = 'heatmap_peak' | 'near_peak' | 'fallback_default';

export interface SmartSlotSuggestion {
  platform: Platform;
  dateISO: string;
  score: number;
  reason: SmartSlotReason;
}

export interface UserActivityHeatmap {
  [platform: string]: number[];
}

export interface SmartCampaign {
  id: string;
  name: string;
  goal?: string;
  createdAt: string;
  updatedAt: string;
  content: PostContent;
  posts: ScheduledPost[];
  suggestedPosts: ScheduledPost[];
  channels: Platform[];
  userActivityHeatmap?: UserActivityHeatmap;
  aiSummary?: string;
}
