import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// One Facebook user managing several pages, each belonging to a different Postfly account (an
// agency owner's own page + a customer's page): connecting from the customer's account must pick
// the customer's page, never the page already connected to the owner's account.
const { buildAuthUrl, handleOAuthCallback } = await import('@/lib/server/social-oauth');
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
