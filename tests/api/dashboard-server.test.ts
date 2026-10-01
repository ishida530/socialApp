import { afterEach, describe, expect, it, vi } from 'vitest';

// Performance phase 2 (2026-10-01): the dashboard is a Server Component - session checked and the
// first data read on the server. These tests cover the shared data functions and the page's
// redirect / data-passing behavior.

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
  }),
}));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (url: string) => redirectMock(url),
}));

const { default: DashboardPage } = await import('@/app/dashboard/page');
const { default: DashboardLayout } = await import('@/app/dashboard/layout');
const { getOnboardingProgress, getAnalyticsSummary } = await import('@/lib/server/dashboard-data');
const { TOKEN_COOKIE_NAME } = await import('@/lib/server/auth');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, createSocialAccount, createVideo, createDraftJob } = await import(
  '../helpers/fixtures'
);

let cleanupUserId: string | null = null;

afterEach(async () => {
  cookieStore.clear();
  redirectMock.mockClear();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('dashboard data', () => {
  it('reports onboarding progress from the database', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    expect(await getOnboardingProgress(user.id)).toEqual({
      hasAccounts: false,
      hasMedia: false,
      hasDrafts: false,
      hasSchedule: false,
    });

    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId: `g-${user.id}` });

    expect(await getOnboardingProgress(user.id)).toEqual({
      hasAccounts: true,
      hasMedia: true,
      hasDrafts: true,
      hasSchedule: true,
    });
  });

  it('counts the last 30 days of jobs and the success rate', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'FACEBOOK');
    const video = await createVideo(user.id);
    await prisma.publishJob.createMany({
      data: [
        { status: 'SUCCESS', postGroupId: 'a', caption: '', scheduledFor: new Date(), videoId: video.id, socialAccountId: account.id },
        { status: 'FAILED', postGroupId: 'b', caption: '', scheduledFor: new Date(), videoId: video.id, socialAccountId: account.id },
      ],
    });

    const summary = await getAnalyticsSummary(user.id, '30d');

    expect(summary.totals).toMatchObject({ videosUploaded: 1, jobsCreated: 2, jobsSucceeded: 1, jobsFailed: 1, successRate: 50 });
    expect(summary.trend).toHaveLength(30);
  });
});

describe('DashboardLayout (session gate before the loading boundary)', () => {
  it('redirects a logged-out visitor before anything streams', async () => {
    await expect(DashboardLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('renders children for a valid session', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    cookieStore.set(TOKEN_COOKIE_NAME, token);

    expect(await DashboardLayout({ children: 'content' })).toBe('content');
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe('DashboardPage (Server Component)', () => {
  it('redirects to /login on the server when there is no session cookie', async () => {
    await expect(DashboardPage()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('redirects to /login for an invalid token', async () => {
    cookieStore.set(TOKEN_COOKIE_NAME, 'not-a-jwt');
    await expect(DashboardPage()).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('renders the dashboard with server-fetched data for a valid session', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    cookieStore.set(TOKEN_COOKIE_NAME, token);

    const element = await DashboardPage();
    const children = (element as { props: { children: Array<{ props: Record<string, unknown> }> } }).props.children;
    const dashboardProps = children[1].props;

    expect(redirectMock).not.toHaveBeenCalled();
    expect(dashboardProps.initialAnalytics).toMatchObject({ totals: { jobsCreated: 0 } });
    expect(dashboardProps.initialOnboarding).toEqual({
      hasAccounts: false,
      hasMedia: false,
      hasDrafts: false,
      hasSchedule: false,
    });
  });
});
