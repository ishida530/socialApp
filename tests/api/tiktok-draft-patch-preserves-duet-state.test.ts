import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// BUG-004: PATCH /api/publish-jobs/drafts/[id] computed allowDuet/allowStitch/allowComment
// only from fields present in THIS request's body (`body.tiktokAllowDuet !== false`), ignoring
// the value already stored on the job. The composer sends one field per PATCH (changing the
// privacy dropdown sends only `{ tiktokPrivacyLevel }`), so on any account with duet disabled,
// `body.tiktokAllowDuet` was `undefined` -> treated as `true` -> the endpoint rejected the
// privacy-level change with "duet jest wylaczony", even though duet was already saved as off.
// This made it impossible to change TikTok privacy at all on such accounts.

const mockCreatorInfo = vi.fn();
vi.mock('@/lib/server/tiktok-creator-info', () => ({
  fetchTikTokCreatorInfo: (...args: unknown[]) => mockCreatorInfo(...args),
}));

const { PATCH } = await import('@/app/api/publish-jobs/drafts/[id]/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo, createDraftJob, authHeaders } =
  await import('../helpers/fixtures');

function patchRequest(id: string, body: unknown, headers: Record<string, string>) {
  return new NextRequest(`http://localhost:3000/api/publish-jobs/drafts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  mockCreatorInfo.mockReset();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('PATCH /api/publish-jobs/drafts/:id preserves already-saved duet/stitch state', () => {
  it('accepts a privacy-level-only change when duet is already saved as off, even without resending tiktokAllowDuet', async () => {
    mockCreatorInfo.mockResolvedValue({
      privacy_level_options: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE', 'FOLLOWER_OF_CREATOR'],
      duet_disabled: true,
      stitch_disabled: false,
      comment_disabled: false,
    });

    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'TIKTOK');
    const video = await createVideo(user.id);
    const job = await createDraftJob({
      videoId: video.id,
      socialAccountId: account.id,
      postGroupId: `group-${user.id}`,
      tiktokPrivacyLevel: 'FOLLOWER_OF_CREATOR',
    });
    // Simulate the account's duet already having been saved as off (e.g. by the composer's
    // earlier auto-save when creator-info first loaded), the same way a real draft would be
    // by the time a user later changes only the privacy dropdown.
    await prisma.publishJob.update({ where: { id: job.id }, data: { tiktokAllowDuet: false } });

    const response = await PATCH(
      patchRequest(job.id, { tiktokPrivacyLevel: 'SELF_ONLY' }, authHeaders(token)),
      { params: Promise.resolve({ id: job.id }) },
    );

    expect(response.status).toBe(200);

    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.tiktokPrivacyLevel).toBe('SELF_ONLY');
    expect(updated.tiktokAllowDuet).toBe(false);
  });

  it('still rejects explicitly turning duet on for an account where TikTok has duet disabled', async () => {
    mockCreatorInfo.mockResolvedValue({
      privacy_level_options: ['SELF_ONLY'],
      duet_disabled: true,
      stitch_disabled: false,
      comment_disabled: false,
    });

    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'TIKTOK');
    const video = await createVideo(user.id);
    const job = await createDraftJob({
      videoId: video.id,
      socialAccountId: account.id,
      postGroupId: `group-${user.id}`,
      tiktokPrivacyLevel: 'SELF_ONLY',
    });
    await prisma.publishJob.update({ where: { id: job.id }, data: { tiktokAllowDuet: false } });

    const response = await PATCH(
      patchRequest(job.id, { tiktokPrivacyLevel: 'SELF_ONLY', tiktokAllowDuet: true }, authHeaders(token)),
      { params: Promise.resolve({ id: job.id }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/duet jest wyłączony/);
  });
});
