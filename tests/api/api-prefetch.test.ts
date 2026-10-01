import { afterEach, describe, expect, it, vi } from 'vitest';

// Performance phase 2 (2026-10-01): section layouts prefetch mount-time GETs on the server
// (prefetchApi - the real route handlers, with the visitor's cookies) and the client seeds its
// apiClient cache with them (seedApiCache), so the page's own requests resolve without the network.

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => Array.from(cookieStore, ([name, value]) => ({ name, value })),
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
  }),
}));

const { prefetchApi } = await import('@/lib/server/api-prefetch');
const { TOKEN_COOKIE_NAME } = await import('@/lib/server/auth');
const { createTestUser, deleteTestUser, createSocialAccount } = await import('../helpers/fixtures');

let cleanupUserId: string | null = null;

afterEach(async () => {
  cookieStore.clear();
  vi.unstubAllGlobals();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('prefetchApi (server)', () => {
  it("returns exactly what the API returns for the visitor's own session", async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const account = await createSocialAccount(user.id, 'FACEBOOK', { handle: 'Moja Strona' });
    cookieStore.set(TOKEN_COOKIE_NAME, token);

    const entries = await prefetchApi(['/social-accounts', '/not-whitelisted']);

    expect(entries.map((entry) => entry.url)).toEqual(['/social-accounts']);
    const accounts = entries[0].data as Array<{ id: string; handle: string }>;
    expect(accounts.map((row) => row.id)).toEqual([account.id]);
    expect(accounts[0].handle).toBe('Moja Strona');
  });

  it('seeds nothing without a session (the handler answers 401)', async () => {
    expect(await prefetchApi(['/social-accounts', '/billing/subscription'])).toEqual([]);
  });
});

describe('seedApiCache (client)', () => {
  it('lets apiClient.get resolve a seeded URL without a network request', async () => {
    vi.stubGlobal('window', { location: { pathname: '/schedule' } });
    const { apiClient, seedApiCache } = await import('@/lib/api-client');
    const adapter = vi.fn();
    apiClient.defaults.adapter = adapter;

    seedApiCache([{ url: '/videos', data: [{ id: 'v1' }] }]);
    const response = await apiClient.get('/videos');

    expect(response.data).toEqual([{ id: 'v1' }]);
    expect(adapter).not.toHaveBeenCalled();
  });
});
