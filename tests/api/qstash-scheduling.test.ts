import { afterEach, describe, expect, it, vi } from 'vitest';

const mockScheduleQStashPublish = vi.fn();
const mockCancelQStashMessage = vi.fn();
vi.mock('@/lib/server/qstash', () => ({
  scheduleQStashPublish: mockScheduleQStashPublish,
  cancelQStashMessage: mockCancelQStashMessage,
}));

const { enqueueDraftGroup, cancelPublishJob } = await import('@/lib/server/publish-jobs');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo, createDraftJob } = await import('../helpers/fixtures');

let cleanupUserId: string | null = null;

afterEach(async () => {
  mockScheduleQStashPublish.mockReset();
  mockCancelQStashMessage.mockReset();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('enqueueDraftGroup schedules a precise QStash trigger for genuinely-scheduled jobs', () => {
  it('calls scheduleQStashPublish with the job id and scheduled date, persists the returned messageId', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    const postGroupId = `group-${user.id}`;
    const job = await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId });

    mockScheduleQStashPublish.mockResolvedValue('qstash-msg-1');

    const scheduledDate = new Date(Date.now() + 60 * 60 * 1000);
    const result = await enqueueDraftGroup(user.id, {
      postGroupId,
      publishNow: false,
      scheduledDate: scheduledDate.toISOString(),
      targetPlatforms: ['FACEBOOK'],
    });

    expect(result.ok).toBe(true);
    expect(mockScheduleQStashPublish).toHaveBeenCalledWith(job.id, scheduledDate);

    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.qstashMessageId).toBe('qstash-msg-1');
  });

  it('does not call scheduleQStashPublish for publishNow jobs (no delay to schedule)', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    const postGroupId = `group-${user.id}`;
    await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId });

    await enqueueDraftGroup(user.id, {
      postGroupId,
      publishNow: true,
      targetPlatforms: ['FACEBOOK'],
    });

    expect(mockScheduleQStashPublish).not.toHaveBeenCalled();
  });

  it('leaves qstashMessageId null when scheduleQStashPublish returns null (not configured / failed)', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    const postGroupId = `group-${user.id}`;
    const job = await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId });

    mockScheduleQStashPublish.mockResolvedValue(null);

    const result = await enqueueDraftGroup(user.id, {
      postGroupId,
      publishNow: false,
      scheduledDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      targetPlatforms: ['FACEBOOK'],
    });

    expect(result.ok).toBe(true);
    const updated = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.qstashMessageId).toBeNull();
    expect(updated.status).toBe('PENDING');
  });
});

describe('cancelPublishJob cancels the QStash message if one was scheduled', () => {
  it('calls cancelQStashMessage when the job has qstashMessageId set', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: `group-${user.id}`,
        caption: 'x',
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
        videoId: video.id,
        socialAccountId: account.id,
        qstashMessageId: 'qstash-msg-2',
      },
    });

    const result = await cancelPublishJob(user.id, job.id);

    expect(result.ok).toBe(true);
    expect(mockCancelQStashMessage).toHaveBeenCalledWith('qstash-msg-2');
  });

  it('does not call cancelQStashMessage when the job never had a QStash message', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    const job = await prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: `group-${user.id}`,
        caption: 'x',
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    await cancelPublishJob(user.id, job.id);
    expect(mockCancelQStashMessage).not.toHaveBeenCalled();
  });
});
