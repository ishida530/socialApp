import { afterEach, describe, expect, it, vi } from 'vitest';
import { processPublishJobImmediately } from '@/lib/server/publish-processor';
import { encrypt } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo } from '../helpers/fixtures';

// Regression test for the bug described in prompt-dla-claude-code.md: caption/hashtags
// typed per platform in the composer must be what actually gets sent to the platform at
// publish time - not video.title/video.description. tests/api/drafts-content-persistence.test.ts
// already covers that the content survives DRAFT creation; this covers the other half of the
// same bug, the part that never had a test: what lib/server/publish-processor.ts actually
// puts in the outbound request body when it publishes a PENDING job.

let cleanupUserId: string | null = null;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('publish-processor content consumption (prompt-dla-claude-code.md regression)', () => {
  it('sends the PublishJob caption/hashtags/title to Facebook, not video.title/video.description', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const account = await createSocialAccount(user.id, 'FACEBOOK', {
      accessToken: encrypt('real-looking-facebook-access-token'),
    });

    const video = await createVideo(user.id, {
      title: 'WRONG - this is the video title, must never reach the platform',
    });

    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: `group-${user.id}`,
        caption: 'RIGHT - the caption the user actually wrote for this platform',
        hashtags: ['#rap', '#newdrop'],
        title: 'RIGHT title for this platform',
        scheduledFor: new Date(Date.now() - 1000),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'fb-post-123', post_id: 'fb-post-123' }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await processPublishJobImmediately(job.id);
    expect(outcome).toBe('succeeded');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(calledUrl).toContain('/videos');

    const sentBody = new URLSearchParams(calledInit.body);
    expect(sentBody.get('title')).toBe('RIGHT title for this platform');
    expect(sentBody.get('description')).toContain('RIGHT - the caption the user actually wrote for this platform');
    expect(sentBody.get('description')).toContain('#rap');
    expect(sentBody.get('description')).toContain('#newdrop');

    expect(sentBody.get('title')).not.toContain('WRONG');
    expect(sentBody.get('description')).not.toContain('WRONG');

    const updatedJob = await prisma.publishJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe('SUCCESS');
  });
});
