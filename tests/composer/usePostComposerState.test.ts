import { describe, expect, it } from 'vitest';
import { reducer, initialState, type State } from '@/components/composer/usePostComposerState';
import type { DraftJob, Platform } from '@/components/composer/types';

function makeJob(platform: Platform, overrides: Partial<DraftJob> = {}): DraftJob {
  return {
    id: `job-${platform}`,
    status: 'DRAFT',
    postGroupId: 'group-1',
    caption: '',
    hashtags: [],
    title: null,
    mentions: [],
    isExplicit: null,
    contentWarnings: [],
    tiktokPrivacyLevel: null,
    tiktokAllowComment: null,
    tiktokAllowDuet: null,
    tiktokAllowStitch: null,
    tiktokConsentAt: null,
    scheduledFor: new Date().toISOString(),
    publishedAt: null,
    remotePostId: null,
    remotePostUrl: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    videoId: 'video-1',
    socialAccountId: `acct-${platform}`,
    video: {
      id: 'video-1',
      title: 'img-verify-cover',
      sourceUrl: 'https://example.com/fake.jpg',
      thumbnailUrl: null,
      mediaType: 'IMAGE',
      durationSec: null,
    },
    socialAccount: { id: `acct-${platform}`, platform, handle: `handle-${platform}` },
    ...overrides,
  };
}

// Regression tests for three bugs found while manually verifying the IMAGE-post /
// YouTube-exclusion flow (Punkt 3). All three trace back to the composer's reducer in
// usePostComposerState.ts, which is a pure function of (state, action) — no DOM needed.

describe('usePostComposerState reducer regressions', () => {
  it('does not block navigation from content to schedule when TikTok is selected without privacy/consent set yet (previously "Dalej" was blocked for TikTok posts)', () => {
    const tiktokJob = makeJob('TIKTOK', { tiktokPrivacyLevel: null, tiktokConsentAt: null });
    const stateInContent: State = {
      ...initialState,
      step: 'content',
      jobs: [tiktokJob],
      selectedPlatforms: new Set<Platform>(['TIKTOK']),
    };

    const next = reducer(stateInContent, { type: 'GO_TO_SCHEDULE' });

    expect(next.step).toBe('schedule');
  });

  // Original repro: right after RESUME_GROUP, selectedPlatforms was empty (zero platforms
  // selected) even though jobs were populated. Current code already derives selectedPlatforms
  // from the resumed jobs directly, so this passes today — kept as a regression floor, not a
  // hunt for a narrower repro (may have been fixed incidentally alongside the state.video
  // backfill below, since both live in the same RESUME_GROUP branch).
  it('selects exactly the resumed jobs\' platforms immediately on resume', () => {
    const jobs = [makeJob('INSTAGRAM'), makeJob('TIKTOK')];
    const stateWithResume: State = {
      ...initialState,
      resumeCandidate: { postGroupId: 'group-1', jobs, askDefaultExplicit: false },
    };

    const next = reducer(stateWithResume, { type: 'RESUME_GROUP' });

    expect(next.selectedPlatforms).toEqual(new Set<Platform>(['INSTAGRAM', 'TIKTOK']));
  });

  // Original bug: RESUME_GROUP never set state.video, only the fresh-upload path (SET_VIDEO)
  // did. That silently broke every `state.video?.mediaType === 'IMAGE'` check on the resume
  // path (the YouTube-skipped note, image-vs-video preview, status screen). Fixed by backfilling
  // video from jobs[0].video, which the API already returns.
  it('backfills state.video from the resumed job on resume', () => {
    const imageJob = makeJob('INSTAGRAM');
    const stateWithResume: State = {
      ...initialState,
      resumeCandidate: { postGroupId: 'group-1', jobs: [imageJob], askDefaultExplicit: false },
    };

    const next = reducer(stateWithResume, { type: 'RESUME_GROUP' });

    expect(next.video).not.toBeNull();
    expect(next.video?.mediaType).toBe('IMAGE');
    expect(next.video?.id).toBe(imageJob.video.id);
  });
});
