import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// One Facebook user managing several pages, each belonging to a different Postfly account (an
// agency owner's own page + a customer's page): connecting from the customer's account must pick
// the customer's page, never the page already connected to the owner's account.
const { buildAuthUrl, handleOAuthCallback, refreshSocialAccessToken, decryptToken } = await import(
  '@/lib/server/social-oauth'
);
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser } = await import('../helpers/fixtures');

const ENV_KEYS = ['FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET', 'FACEBOOK_REDIRECT_URI', 'OAUTH_STATE_SECRET'] as const;
const originalEnv: Record<string, string | undefined> = {};
const cleanup: string[] = [];

const OWNER_PAGE = { id: 'page-owner-111', name: 'Strona właściciela', access_token: 'owner-page-token' };
const CUSTOMER_PAGE = { id: 'page-customer-222', name: 'Biuro Nieruchomości PRYZMAT', access_token: 'customer-page-token' };

function stubMeta(pages: Array<Record<string, unknown>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/oauth/access_token')) {
        return { ok: true, json: async () => ({ access_token: 'user-token', expires_in: 3600 }) };
      }
      if (url.includes('/me/accounts')) {
        return { ok: true, json: async () => ({ data: pages }) };
      }
      if (url.includes('/me?fields=id')) {
        return { ok: true, json: async () => ({ id: 'fb-user-777', name: 'Paweł' }) };
      }
      return { ok: false, text: async () => 'unexpected', statusText: 'unexpected' };
    }),
  );
}

function stateFor(userId: string) {
  return new URL(buildAuthUrl('facebook', userId).url).searchParams.get('state')!;
}

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  process.env.FACEBOOK_CLIENT_ID = 'test-client';
  process.env.FACEBOOK_CLIENT_SECRET = 'test-secret';
  process.env.FACEBOOK_REDIRECT_URI = 'http://localhost:3000/api/auth/callback/facebook';
  process.env.OAUTH_STATE_SECRET = 'test-oauth-state-secret';
});

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const id of cleanup.splice(0)) await deleteTestUser(id);
  for (const key of ENV_KEYS) process.env[key] = originalEnv[key];
});

describe('Meta Facebook user ID for data deletion requests', () => {
  // 2026-10-10: Meta's Data Deletion Request names only the Facebook user, so the connection stores it.
  it('stores the Facebook user ID on the connected Page', async () => {
    const { user } = await createTestUser();
    cleanup.push(user.id);

    stubMeta([CUSTOMER_PAGE]);
    await handleOAuthCallback('facebook', { code: 'abc', state: stateFor(user.id) });

    const [connected] = await prisma.socialAccount.findMany({ where: { userId: user.id } });
    expect(connected.externalId).toBe(CUSTOMER_PAGE.id);
    expect(connected.metaUserId).toBe('fb-user-777');
  });
});

describe('Meta page selection across Postfly accounts', () => {
  it("skips a page already connected to another account and connects the customer's page", async () => {
    const { user: owner } = await createTestUser();
    const { user: customer } = await createTestUser();
    cleanup.push(owner.id, customer.id);
    await prisma.socialAccount.create({
      data: { userId: owner.id, platform: 'FACEBOOK', handle: OWNER_PAGE.name, externalId: OWNER_PAGE.id },
    });

    stubMeta([OWNER_PAGE, CUSTOMER_PAGE]);
    await handleOAuthCallback('facebook', { code: 'abc', state: stateFor(customer.id) });

    const connected = await prisma.socialAccount.findMany({ where: { userId: customer.id } });
    expect(connected.map((a) => a.externalId)).toEqual([CUSTOMER_PAGE.id]);
  });

  it('keeps reconnecting the page this account already has, even if another page comes first', async () => {
    const { user } = await createTestUser();
    cleanup.push(user.id);
    await prisma.socialAccount.create({
      data: { userId: user.id, platform: 'FACEBOOK', handle: CUSTOMER_PAGE.name, externalId: CUSTOMER_PAGE.id },
    });

    stubMeta([OWNER_PAGE, CUSTOMER_PAGE]);
    await handleOAuthCallback('facebook', { code: 'abc', state: stateFor(user.id) });

    const connected = await prisma.socialAccount.findMany({ where: { userId: user.id } });
    expect(connected.map((a) => a.externalId)).toEqual([CUSTOMER_PAGE.id]);
  });

  it('explains what to do when every page belongs to another account', async () => {
    const { user: owner } = await createTestUser();
    const { user: customer } = await createTestUser();
    cleanup.push(owner.id, customer.id);
    await prisma.socialAccount.create({
      data: { userId: owner.id, platform: 'FACEBOOK', handle: OWNER_PAGE.name, externalId: OWNER_PAGE.id },
    });

    stubMeta([OWNER_PAGE]);
    await expect(handleOAuthCallback('facebook', { code: 'abc', state: stateFor(customer.id) })).rejects.toThrow(
      /już połączone z innymi kontami Postfly/,
    );
  });
});

// 2026-09-30: the code exchange yields a short-lived user token, and a Page token read with it
// lives ~1 hour. The callback now swaps for a long-lived user token first, stores the resulting
// (non-expiring) Page token with expiresAt=null and keeps the long-lived user token to re-derive
// the Page token on refresh.
describe('Meta durable Page tokens', () => {
  function stubDurableMeta() {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        calls.push(url);
        if (url.includes('/oauth/access_token') && url.includes('grant_type=fb_exchange_token')) {
          return { ok: true, json: async () => ({ access_token: 'long-lived-user-token', expires_in: 5183944 }) };
        }
        if (url.includes('/oauth/access_token')) {
          return { ok: true, json: async () => ({ access_token: 'short-user-token', expires_in: 3600 }) };
        }
        if (url.includes('/me/accounts')) {
          const token = new URL(url).searchParams.get('access_token');
          return {
            ok: true,
            json: async () => ({
              data: [{ ...CUSTOMER_PAGE, access_token: token === 'long-lived-user-token' ? 'durable-page-token' : 'short-page-token' }],
            }),
          };
        }
        return { ok: false, text: async () => 'unexpected', statusText: 'unexpected' };
      }),
    );
    return calls;
  }

  it('stores a Page token derived from the long-lived user token, with no expiry', async () => {
    const { user } = await createTestUser();
    cleanup.push(user.id);
    stubDurableMeta();

    await handleOAuthCallback('facebook', { code: 'abc', state: stateFor(user.id) });

    const account = await prisma.socialAccount.findFirstOrThrow({ where: { userId: user.id, platform: 'FACEBOOK' } });
    expect(decryptToken(account.accessToken)).toBe('durable-page-token');
    expect(decryptToken(account.refreshToken)).toBe('long-lived-user-token');
    expect(account.expiresAt).toBeNull();
  });

  it('refresh re-derives the Page token from the stored long-lived user token', async () => {
    const { user } = await createTestUser();
    cleanup.push(user.id);
    stubDurableMeta();
    await handleOAuthCallback('facebook', { code: 'abc', state: stateFor(user.id) });
    const account = await prisma.socialAccount.findFirstOrThrow({ where: { userId: user.id, platform: 'FACEBOOK' } });

    const refreshed = await refreshSocialAccessToken(account.id);

    expect(refreshed.accessToken).toBe('durable-page-token');
    const after = await prisma.socialAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.expiresAt).toBeNull();
  });
});
