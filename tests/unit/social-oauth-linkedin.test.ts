import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAuthUrl } from '@/lib/server/social-oauth';

// LinkedIn integration (2026-09-16): no OAuth-route tests exist yet for any platform in this repo
// (see project history) - added here specifically because this is a brand-new, unverified-with-
// real-credentials integration, unlike Facebook/Instagram/TikTok/YouTube which the owner has
// already exercised against real accounts.

const ORIGINAL_ENV = {
  LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID,
  LINKEDIN_REDIRECT_URI: process.env.LINKEDIN_REDIRECT_URI,
  LINKEDIN_OAUTH_SCOPES: process.env.LINKEDIN_OAUTH_SCOPES,
  OAUTH_STATE_SECRET: process.env.OAUTH_STATE_SECRET,
};

beforeEach(() => {
  process.env.LINKEDIN_CLIENT_ID = 'test-linkedin-client-id';
  process.env.LINKEDIN_REDIRECT_URI = 'https://postfly.pl/api/auth/callback/linkedin';
  delete process.env.LINKEDIN_OAUTH_SCOPES;
  process.env.OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET || 'test-oauth-state-secret';
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('buildAuthUrl - linkedin', () => {
  it('builds the LinkedIn authorization URL with client id, redirect uri, and the personal-profile scopes', () => {
    const result = buildAuthUrl('linkedin', 'user-123');

    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization');
    expect(url.searchParams.get('client_id')).toBe('test-linkedin-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://postfly.pl/api/auth/callback/linkedin');
    expect(url.searchParams.get('response_type')).toBe('code');

    const scope = url.searchParams.get('scope') ?? '';
    // Profil osobisty (Share on LinkedIn), nie strona firmowa (Community Management API) - patrz
    // komentarz przy enum Platform w schema.prisma.
    expect(scope).toContain('w_member_social');
    expect(scope).toContain('openid');
    expect(scope).not.toContain('w_organization_social');
  });

  it('signs the state so it round-trips to the requesting user (same mechanism as every other platform)', () => {
    const result = buildAuthUrl('linkedin', 'user-123');
    const url = new URL(result.url);
    const state = url.searchParams.get('state');

    expect(state).toBeTruthy();
    expect(state).toContain('.');
  });

  it('throws a clear config error instead of silently building a broken URL when LINKEDIN_CLIENT_ID is missing', () => {
    delete process.env.LINKEDIN_CLIENT_ID;

    expect(() => buildAuthUrl('linkedin', 'user-123')).toThrow(/LINKEDIN_CLIENT_ID/);
  });
});
