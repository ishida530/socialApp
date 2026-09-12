import type { DraftJob } from './types';

export type JobStatusDisplay =
  | { kind: 'success'; label: string; url: string | null }
  | { kind: 'failed'; label: string; needsReconnect: boolean }
  | { kind: 'processing'; label: string }
  | { kind: 'scheduled'; label: string };

// A PENDING job with a `[tiktok-tracking:...]` errorMessage is TikTok's own two-step publish
// flow (init accepted, status polled a few seconds later) - not a "scheduled for a future date"
// job. Same for any PENDING job whose scheduledFor is only moments away: that's the retry/poll
// loop re-running very soon, not a user-picked future date via "Zaplanuj".
const PROCESSING_WINDOW_MS = 5 * 60 * 1000;

function isTikTokStatusTracking(errorMessage: string | null) {
  return Boolean(errorMessage?.includes('tiktok-tracking:'));
}

function needsReconnect(errorMessage: string | null) {
  if (!errorMessage) {
    return false;
  }
  return (
    errorMessage.includes('oauth-scope-missing') ||
    errorMessage.includes('permission-missing') ||
    errorMessage.includes('unaudited-client')
  );
}

function friendlyError(errorMessage: string | null) {
  if (!errorMessage) {
    return 'Publikacja nie powiodła się.';
  }
  const withoutTags = errorMessage.replace(/^\[[a-z0-9-]+\]\s*/i, '');
  return withoutTags || 'Publikacja nie powiodła się.';
}

export function getJobStatusDisplay(
  job: Pick<DraftJob, 'status' | 'errorMessage' | 'remotePostUrl' | 'scheduledFor'>,
  now: Date = new Date(),
): JobStatusDisplay {
  if (job.status === 'SUCCESS') {
    return { kind: 'success', label: 'Opublikowano', url: job.remotePostUrl };
  }

  if (job.status === 'FAILED') {
    return { kind: 'failed', label: friendlyError(job.errorMessage), needsReconnect: needsReconnect(job.errorMessage) };
  }

  if (isTikTokStatusTracking(job.errorMessage)) {
    return { kind: 'processing', label: 'TikTok przetwarza publikację — status zaktualizuje się automatycznie.' };
  }

  const msUntilScheduled = new Date(job.scheduledFor).getTime() - now.getTime();
  if (msUntilScheduled <= PROCESSING_WINDOW_MS) {
    return { kind: 'processing', label: 'Publikowanie w toku...' };
  }

  return { kind: 'scheduled', label: 'Zaplanowane — publikacja tego dnia (patrz uwaga o cronie)' };
}
