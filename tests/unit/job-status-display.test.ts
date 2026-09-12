import { describe, expect, it } from 'vitest';
import { getJobStatusDisplay } from '@/components/composer/job-status-display';

// BUG-005: the composer's status screen collapsed every non-terminal job into the same
// "scheduled for later today" message, and never surfaced remotePostUrl on success. These
// are the concrete scenarios from the real-usage report: TikTok's async publish (PENDING with
// a tiktok-tracking marker right after clicking "Opublikuj teraz") must read as "processing",
// not "scheduled"; a truly user-scheduled future post must still read as "scheduled"; and a
// SUCCESS job must expose its link so the UI can render it.

function baseJob(overrides: Partial<Parameters<typeof getJobStatusDisplay>[0]> = {}) {
  return {
    status: 'PENDING' as const,
    errorMessage: null,
    remotePostUrl: null,
    scheduledFor: new Date().toISOString(),
    ...overrides,
  };
}

describe('getJobStatusDisplay', () => {
  it('reads SUCCESS with a link as success + url', () => {
    const result = getJobStatusDisplay(
      baseJob({ status: 'SUCCESS', remotePostUrl: 'https://www.tiktok.com/@u/video/123' }),
    );
    expect(result).toEqual({ kind: 'success', label: 'Opublikowano', url: 'https://www.tiktok.com/@u/video/123' });
  });

  it('reads SUCCESS without a link as success + null url (no link section to render)', () => {
    const result = getJobStatusDisplay(baseJob({ status: 'SUCCESS', remotePostUrl: null }));
    expect(result).toEqual({ kind: 'success', label: 'Opublikowano', url: null });
  });

  it('reads FAILED as failed with a human-friendly, tag-stripped message', () => {
    const result = getJobStatusDisplay(
      baseJob({ status: 'FAILED', errorMessage: '[tiktok-unaudited-client] Integracja dziala w trybie ograniczonym.' }),
    );
    expect(result.kind).toBe('failed');
    expect(result).toMatchObject({ label: 'Integracja dziala w trybie ograniczonym.', needsReconnect: true });
  });

  it('reads a PENDING job with a tiktok-tracking marker as processing, not scheduled', () => {
    const now = new Date('2026-09-12T13:38:12Z');
    const result = getJobStatusDisplay(
      baseJob({
        status: 'PENDING',
        errorMessage: '[tiktok-tracking:v_pub_url~v2-1:1] awaiting-final-status',
        scheduledFor: new Date(now.getTime() + 59_736).toISOString(),
      }),
      now,
    );
    expect(result.kind).toBe('processing');
  });

  it('reads a PENDING job scheduled moments from now as processing (publishNow retry loop)', () => {
    const now = new Date('2026-09-12T13:38:12Z');
    const result = getJobStatusDisplay(
      baseJob({ status: 'PENDING', errorMessage: null, scheduledFor: new Date(now.getTime() + 30_000).toISOString() }),
      now,
    );
    expect(result.kind).toBe('processing');
  });

  it('reads a PENDING job genuinely scheduled hours ahead (user picked "Zaplanuj") as scheduled', () => {
    const now = new Date('2026-09-12T13:38:12Z');
    const result = getJobStatusDisplay(
      baseJob({
        status: 'PENDING',
        errorMessage: null,
        scheduledFor: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
      }),
      now,
    );
    expect(result.kind).toBe('scheduled');
    expect(result.label).toMatch(/Zaplanowane/);
  });
});
