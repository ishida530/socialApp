import type { Platform, UserActivityHeatmap } from './types';

const DEFAULT_HEATMAP: UserActivityHeatmap = {
  youtube: [0.05, 0.04, 0.03, 0.03, 0.03, 0.04, 0.06, 0.09, 0.12, 0.16, 0.2, 0.24, 0.28, 0.3, 0.32, 0.34, 0.36, 0.42, 0.48, 0.52, 0.46, 0.3, 0.2, 0.12],
  tiktok: [0.08, 0.06, 0.05, 0.05, 0.04, 0.05, 0.08, 0.12, 0.18, 0.24, 0.28, 0.3, 0.34, 0.36, 0.38, 0.4, 0.42, 0.5, 0.6, 0.66, 0.58, 0.44, 0.28, 0.14],
  instagram: [0.07, 0.05, 0.04, 0.04, 0.03, 0.05, 0.08, 0.12, 0.2, 0.26, 0.3, 0.34, 0.38, 0.36, 0.34, 0.32, 0.34, 0.42, 0.5, 0.54, 0.46, 0.34, 0.22, 0.12],
  facebook: [0.06, 0.05, 0.04, 0.03, 0.03, 0.04, 0.06, 0.1, 0.14, 0.2, 0.24, 0.28, 0.32, 0.34, 0.32, 0.3, 0.3, 0.34, 0.38, 0.4, 0.34, 0.26, 0.18, 0.1],
};

function getHeatmapForPlatform(platform: Platform, heatmap?: UserActivityHeatmap) {
  const source = heatmap?.[platform] ?? DEFAULT_HEATMAP[platform];

  if (!Array.isArray(source) || source.length !== 24) {
    return DEFAULT_HEATMAP[platform];
  }

  return source;
}

function getBestHour(activityByHour: number[]) {
  const candidate = activityByHour
    .map((score, hour) => ({ hour, score }))
    .sort((a, b) => b.score - a.score)[0];

  return candidate ?? { hour: 18, score: 0.1 };
}

export function findBestSlot(
  date: Date,
  platform: Platform,
  userActivityHeatmap?: UserActivityHeatmap,
): Date {
  const sourceDate = new Date(date);
  const activityByHour = getHeatmapForPlatform(platform, userActivityHeatmap);
  const { hour } = getBestHour(activityByHour);

  sourceDate.setHours(hour, 0, 0, 0);

  if (sourceDate.getTime() <= Date.now()) {
    sourceDate.setDate(sourceDate.getDate() + 1);
  }

  return sourceDate;
}
