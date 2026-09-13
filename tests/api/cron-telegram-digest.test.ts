import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', () => ({
  sendTelegramMessage: mockSendTelegramMessage,
}));

const { GET } = await import('@/app/api/cron/telegram-digest/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo } = await import('../helpers/fixtures');

const CRON_URL = 'http://localhost:3000/api/cron/telegram-digest';
const SECRET = process.env.CRON_SECRET as string;

function cronRequest(authorization?: string) {
  const headers: Record<string, string> = {};
  if (authorization !== undefined) {
    headers.authorization = authorization;
  }
  return new NextRequest(CRON_URL, { headers });
}

const cleanupUserIds: string[] = [];

afterEach(async () => {
  mockSendTelegramMessage.mockClear();
  await Promise.all(cleanupUserIds.splice(0).map((id) => deleteTestUser(id)));
});

describe('GET /api/cron/telegram-digest (TASK-3.2.2)', () => {
  it('rejects a request with a missing/invalid CRON_SECRET', async () => {
    const missing = await GET(cronRequest());
    expect(missing.status).toBe(401);

    const wrong = await GET(cronRequest('Bearer not-the-real-secret'));
    expect(wrong.status).toBe(401);

    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it('with a valid secret, sends the digest and reports a summary', async () => {
    const { user } = await createTestUser();
    cleanupUserIds.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    const account = await createSocialAccount(user.id, 'INSTAGRAM');
    const video = await createVideo(user.id);
    await prisma.publishJob.create({
      data: {
        status: 'SUCCESS',
        postGroupId: 'digest-group',
        caption: 'x',
        hashtags: [],
        scheduledFor: new Date(),
        publishedAt: new Date(),
        videoId: video.id,
        socialAccountId: account.id,
      },
    });

    const response = await GET(cronRequest(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.usersNotified).toBe(1);
    expect(body.jobsNotified).toBe(1);
    // No growth history yet for this user - the sponsorship signal (TASK-5.4.3) never fires here.
    expect(body.sponsorshipSignalsSent).toBe(0);
    expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
  });
});
