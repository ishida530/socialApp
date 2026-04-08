export type Persona = 'video_creator' | 'ecommerce_owner' | 'real_estate_agent' | 'neutral';

export type ContentType = 'video' | 'text' | 'image' | 'mixed' | 'unknown';

export type Intent = 'promotional' | 'educational' | 'informational' | 'listing' | 'unknown';

export type OrchestrationMode = 'manual' | 'ai-autopilot';

export type SubscriptionTier = 'standard' | 'pro' | 'premium';

export type PublishMode = 'draft' | 'auto';

export type WorkflowStatus =
  | 'queued'
  | 'processing'
  | 'draft_ready'
  | 'scheduled'
  | 'published'
  | 'failed';

export type SafetySeverity = 'low' | 'medium' | 'critical';

export type SafetyFlagCode =
  | 'PROMPT_INJECTION_PATTERN'
  | 'PII_EMAIL'
  | 'PII_PHONE'
  | 'PII_ID_NUMBER'
  | 'BANNED_INSTRUCTION'
  | 'UNSAFE_AUTO_PUBLISH';

export type SafetyFlag = {
  code: SafetyFlagCode;
  severity: SafetySeverity;
  message: string;
};

export type MediaFileInput = {
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
  sizeBytes?: number;
};

export type PerformanceDataInput = {
  platform: 'TIKTOK' | 'INSTAGRAM' | 'YOUTUBE' | 'FACEBOOK';
  hour: number;
  ctr?: number;
  er?: number;
  watchTime?: number;
  saves?: number;
};

export type OrchestrateContentInput = {
  personaHint?: Persona;
  rawInput?: string;
  mediaFiles?: MediaFileInput[];
  targetPlatforms?: Array<'TIKTOK' | 'INSTAGRAM' | 'YOUTUBE' | 'FACEBOOK'>;
  timezone: string;
  performanceData?: PerformanceDataInput[];
  mode: OrchestrationMode;
  subscriptionTier?: SubscriptionTier;
  publishMode: PublishMode;
  idempotencyKey: string;
};

export type AnalysisOutput = {
  persona: Persona;
  contentType: ContentType;
  intent: Intent;
  confidence: number;
  safetyFlags: SafetyFlag[];
  unknownAspectRatio: boolean;
  aspectRatioConfidence: number;
};

export type PlatformBundle = {
  platform: 'TIKTOK' | 'INSTAGRAM' | 'YOUTUBE' | 'FACEBOOK';
  title?: string;
  caption: string;
  hashtags: string[];
  cta?: string;
};

export type ScheduleSlot = {
  platform: PlatformBundle['platform'];
  scheduledFor: string;
  timezone: string;
  score: number;
  reason: string;
};

export type OrchestrateContentOutput = {
  analysis?: AnalysisOutput;
  platformBundles: PlatformBundle[];
  schedule: ScheduleSlot[];
  strategySummary?: string;
  warnings: string[];
  usedAI: boolean;
  runId: string;
  status: WorkflowStatus;
};

export class OrchestrationBusinessError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'OrchestrationBusinessError';
    this.status = status;
    this.code = code;
  }
}
