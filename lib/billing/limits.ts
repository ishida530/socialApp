import { PlanTier } from '@prisma/client';
import { FREE_MAX_SCHEDULE_AHEAD_HOURS, PLAN_LIMITS } from './plans';

export type UsageMetric = 'video_uploads' | 'publish_jobs' | 'ai_autopilot_runs';

export function resolvePlanLimits(plan: PlanTier) {
  return PLAN_LIMITS[plan];
}

export function getFreeScheduleWindowEnd(now = new Date()) {
  return new Date(now.getTime() + FREE_MAX_SCHEDULE_AHEAD_HOURS * 60 * 60 * 1000);
}

export function isBeyondFreeScheduleWindow(scheduledFor: Date, now = new Date()) {
  return scheduledFor.getTime() > getFreeScheduleWindowEnd(now).getTime();
}
