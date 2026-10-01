import { afterEach, describe, expect, it, vi } from 'vitest';

// Performance phase 2 (2026-10-01): Analytics and Growth render their first data on the server.

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => Array.from(cookieStore, ([name, value]) => ({ name, value })),
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
  }),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const { default: AnalyticsPage } = await import('@/app/analytics/page');
const { default: GrowthPage } = await import('@/app/growth/page');
const { TOKEN_COOKIE_NAME } = await import('@/lib/server/auth');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser } = await import('../helpers/fixtures');

let cleanupUserId: string | null = null;

afterEach(async () => {
  cookieStore.clear();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

async function loggedIn() {
  const { user, token } = await createTestUser();
  cleanupUserId = user.id;
  cookieStore.set(TOKEN_COOKIE_NAME, token);
  return user;
}

describe('AnalyticsPage (Server Component)', () => {
  it('redirects without a session', async () => {
    await expect(AnalyticsPage()).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('passes the 30-day analytics to the client view', async () => {
    await loggedIn();
    const element = (await AnalyticsPage()) as { props: { initialMetrics: { range: string; trend: unknown[] } } };
    expect(element.props.initialMetrics.range).toBe('30d');
    expect(element.props.initialMetrics.trend).toHaveLength(30);
  });
});

describe('GrowthPage (Server Component)', () => {
  it('passes goals and growth to the panel, dates serialized like the API', async () => {
    const user = await loggedIn();
    await prisma.goal.create({ data: { userId: user.id, description: 'Pierwszy cel' } });

    const element = (await GrowthPage()) as {
      props: { children: Array<{ props: { initialData?: { goals: Array<{ description: string; createdAt: unknown }> } } }> };
    };
    const panel = element.props.children[1];
    expect(panel.props.initialData?.goals.map((goal) => goal.description)).toEqual(['Pierwszy cel']);
    expect(typeof panel.props.initialData?.goals[0].createdAt).toBe('string');
  });
});
