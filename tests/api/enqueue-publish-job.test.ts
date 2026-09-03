import { afterEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/publish-jobs/enqueue/route';
import { prisma } from '@/lib/server/prisma';
import {
  createTestUser,
  deleteTestUser,
  createSocialAccount,
  createVideo,
  createDraftJob,
  authHeaders,
  jsonRequest,
} from '../helpers/fixtures';

// Behavior coverage for the core mechanics of POST /api/publish-jobs/enqueue: this is
// Krok 4 ("Gdzie i kiedy") finalizing DRAFT PublishJobs created earlier by
// POST /publish-jobs/drafts — it does not create new jobs, it flips selected DRAFTs to
// PENDING and deletes the ones the user didn't select.

const ENQUEUE_URL = 'http://localhost:3000/api/publish-jobs/enqueue';
const SOON = new Date(Date.now() + 60 * 60 * 1000).toISOString();

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('POST /api/publish-jobs/enqueue validation', () => {
  it('rejects a request with no postGroupId', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await POST(
      jsonRequest(ENQUEUE_URL, { scheduledDate: SOON, targetPlatforms: ['INSTAGRAM'] }, authHeaders(token)),
    );

    expect(response.status).toBe(400);
  });

  it('rejects scheduling (publishNow=false) with no scheduledDate', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await POST(
      jsonRequest(ENQUEUE_URL, { postGroupId: 'g1', targetPlatforms: ['INSTAGRAM'] }, authHeaders(token)),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors).toEqual(expect.arrayContaining([expect.stringMatching(/scheduledDate jest wymagany/)]));
  });

  it('rejects an unparseable scheduledDate', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await POST(
      jsonRequest(
        ENQUEUE_URL,
        { postGroupId: 'g1', scheduledDate: 'not-a-date', targetPlatforms: ['INSTAGRAM'] },
        authHeaders(token),
      ),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/scheduledDate is invalid/);
  });

  it('rejects an empty targetPlatforms list', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await POST(
      jsonRequest(ENQUEUE_URL, { postGroupId: 'g1', scheduledDate: SOON, targetPlatforms: [] }, authHeaders(token)),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors).toEqual(expect.arrayContaining([expect.stringMatching(/co najmniej 1 platforma/)]));
  });

  it('rejects a postGroupId with no matching DRAFT jobs', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await POST(
      jsonRequest(
        ENQUEUE_URL,
        { postGroupId: 'nonexistent-group', scheduledDate: SOON, targetPlatforms: ['INSTAGRAM'] },
        authHeaders(token),
      ),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/Nie znaleziono niedokończonego posta/);
  });

  it('rejects a target platform with no prepared draft content', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'INSTAGRAM');
    const video = await createVideo(user.id);
    const postGroupId = `group-${user.id}`;
    await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId });

    const response = await POST(
      jsonRequest(
        ENQUEUE_URL,
        { postGroupId, scheduledDate: SOON, targetPlatforms: ['FACEBOOK'] },
        authHeaders(token),
      ),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/Brak przygotowanej treści dla platform/);
  });
});

describe('POST /api/publish-jobs/enqueue happy path', () => {
  it('moves selected DRAFT jobs to PENDING with the requested schedule, and deletes unselected ones', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const igAccount = await createSocialAccount(user.id, 'INSTAGRAM');
    const fbAccount = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    const postGroupId = `group-${user.id}`;
    const igJob = await createDraftJob({ videoId: video.id, socialAccountId: igAccount.id, postGroupId });
    const fbJob = await createDraftJob({ videoId: video.id, socialAccountId: fbAccount.id, postGroupId });

    const response = await POST(
      jsonRequest(
        ENQUEUE_URL,
        { postGroupId, scheduledDate: SOON, publishNow: false, targetPlatforms: ['INSTAGRAM'] },
        authHeaders(token),
      ),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.targetsCount).toBe(1);

    const updatedIg = await prisma.publishJob.findUnique({ where: { id: igJob.id } });
    expect(updatedIg?.status).toBe('PENDING');
    expect(updatedIg?.scheduledFor.toISOString()).toBe(SOON);

    const deletedFb = await prisma.publishJob.findUnique({ where: { id: fbJob.id } });
    expect(deletedFb).toBeNull();
  });
});
