import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

// Platform-review gates (2026-10-02): TikTok/YouTube connections and comment replies are "wkrótce"
// for regular users until the platforms approve them; admins (ADMIN_EMAILS) and the reviewers'
// test accounts (REVIEWER_EMAILS) keep full access.

const { GET: getAuthUrl } = await import('@/app/api/social-accounts/auth-url/[platform]/route');
const { GET: getFeatures } = await import('@/app/api/features/route');
const { POST: refreshComments } = await import('@/app/api/comments/refresh/route');
const { sendCustomReply } = await import('@/lib/server/social-comments');
const { isAdminEmail } = await import('@/lib/server/admin');
const { applyCommentScopes } = await import('@/lib/server/social-oauth');
const { getEffectivePlan } = await import('@/lib/server/subscription');
const { createTestUser, deleteTestUser, authHeaders } = await import('../helpers/fixtures');

const saved: Record<string, string | undefined> = {};
const cleanup: string[] = [];

beforeEach(() => {
  for (const key of ['PLATFORMS_IN_REVIEW', 'COMMENTS_FEATURE_ENABLED', 'ADMIN_EMAILS', 'REVIEWER_EMAILS']) saved[key] = process.env[key];
  delete process.env.PLATFORMS_IN_REVIEW; // default: TIKTOK,YOUTUBE
  delete process.env.COMMENTS_FEATURE_ENABLED; // default: off
  process.env.ADMIN_EMAILS = 'owner-admin@example.com';
  process.env.REVIEWER_EMAILS = 'platform-reviewer@example.com';
});

afterEach(async () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const id of cleanup.splice(0)) await deleteTestUser(id);
});

async function user(email?: string) {
  const created = await createTestUser(email ? { email } : {});
  cleanup.push(created.user.id);
  return created;
}

function request(path: string, token: string, method = 'GET') {
  return new NextRequest(`http://localhost:3000/api${path}`, { method, headers: authHeaders(token) });
}

describe('TikTok / YouTube while their reviews are pending', () => {
  it('a regular user cannot start connecting TikTok or YouTube', async () => {
    const { token } = await user();
    for (const platform of ['tiktok', 'youtube']) {
      const response = await getAuthUrl(request(`/social-accounts/auth-url/${platform}`, token), {
        params: Promise.resolve({ platform }),
      });
      expect(response.status).toBe(403);
      expect((await response.json()).message).toMatch(/wkrótce/);
    }
  });

  it('an admin is not blocked (records the review demos)', async () => {
    const { token } = await user('owner-admin@example.com');
    const response = await getAuthUrl(request('/social-accounts/auth-url/tiktok', token), {
      params: Promise.resolve({ platform: 'tiktok' }),
    });
    expect(response.status).not.toBe(403);
  });

  it('PLATFORMS_IN_REVIEW="" opens them for everyone after approval', async () => {
    process.env.PLATFORMS_IN_REVIEW = '';
    const { token } = await user();
    const features = await (await getFeatures(request('/features', token))).json();
    expect(features.platformsInReview).toEqual([]);
  });

  it('GET /api/features reports the pending platforms per user', async () => {
    const regular = await user();
    const admin = await user('owner-admin@example.com');
    expect((await (await getFeatures(request('/features', regular.token))).json()).platformsInReview).toEqual([
      'TIKTOK',
      'YOUTUBE',
    ]);
    expect((await (await getFeatures(request('/features', admin.token))).json()).platformsInReview).toEqual([]);
  });
});

describe('comment replies while the Meta permissions are pending', () => {
  it('blocks the manual check and replies for a regular user, with a "wkrótce" message', async () => {
    const { user: owner, token } = await user();
    const refresh = await refreshComments(request('/comments/refresh', token, 'POST'));
    expect(refresh.status).toBe(403);

    const reply = await sendCustomReply('any-comment-id', owner.id, 'Dziękujemy!');
    expect(reply).toEqual({ ok: false, error: expect.stringMatching(/wkrótce/) });
  });

  it('COMMENTS_FEATURE_ENABLED=1 turns the feature on for everyone', async () => {
    process.env.COMMENTS_FEATURE_ENABLED = '1';
    const { token } = await user();
    const features = await (await getFeatures(request('/features', token))).json();
    expect(features.commentsEnabled).toBe(true);
  });
});

describe("platform reviewers' test accounts (REVIEWER_EMAILS)", () => {
  it('can connect TikTok and YouTube and use comment replies, without becoming admins', async () => {
    const { token } = await user('platform-reviewer@example.com');
    for (const platform of ['tiktok', 'youtube']) {
      const response = await getAuthUrl(request(`/social-accounts/auth-url/${platform}`, token), {
        params: Promise.resolve({ platform }),
      });
      expect(response.status).not.toBe(403);
    }
    const features = await (await getFeatures(request('/features', token))).json();
    expect(features).toMatchObject({ platformsInReview: [], commentsEnabled: true });
    expect(isAdminEmail('platform-reviewer@example.com')).toBe(false);
  });

  it('get the full plan for the whole review, regardless of the 7-day trial', async () => {
    const { user: reviewer } = await user('platform-reviewer@example.com');
    expect(await getEffectivePlan(reviewer.id)).toBe('BUSINESS');
  });
});

describe('Meta comment permissions in the OAuth request', () => {
  const base = 'public_profile,pages_show_list,pages_manage_posts,business_management';

  it('are requested only when comments are enabled for the user', () => {
    expect(applyCommentScopes(base, 'facebook', false)).toBe(base);
    expect(applyCommentScopes(base, 'facebook', true)).toBe(`${base},pages_manage_engagement,pages_read_user_content`);
    expect(applyCommentScopes('instagram_basic,instagram_content_publish', 'instagram', true)).toBe(
      'instagram_basic,instagram_content_publish,instagram_manage_comments',
    );
  });

  it('are stripped from a configured scope list while comments wait for review', () => {
    expect(applyCommentScopes(`${base},pages_manage_engagement`, 'facebook', false)).toBe(base);
    expect(applyCommentScopes(`${base},pages_manage_engagement`, 'facebook', true)).toBe(
      `${base},pages_manage_engagement,pages_read_user_content`,
    );
  });
});