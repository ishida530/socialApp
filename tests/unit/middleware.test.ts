import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { middleware, config } from '@/middleware';

// middleware.ts (2026-10-01): edge session gate for the authenticated sections (307 -> /login),
// alongside the pre-existing admin gate. Tokens signed exactly like issueAccessToken /
// issuePendingTwoFactorToken (HS256 with JWT_SECRET).

const SECRET = 'middleware-test-secret';
let originalSecret: string | undefined;
let originalAdmins: string | undefined;

beforeEach(() => {
  originalSecret = process.env.JWT_SECRET;
  originalAdmins = process.env.ADMIN_EMAILS;
  process.env.JWT_SECRET = SECRET;
  process.env.ADMIN_EMAILS = 'admin@example.com';
});

afterEach(() => {
  process.env.JWT_SECRET = originalSecret;
  process.env.ADMIN_EMAILS = originalAdmins;
});

function sessionToken(email = 'user@example.com', extra: Record<string, unknown> = {}) {
  return jwt.sign({ sub: 'user-1', email, ...extra }, SECRET, { expiresIn: 3600 });
}

function request(path: string, token?: string) {
  return new NextRequest(`https://postfly.pl${path}`, {
    headers: token ? { cookie: `postfly_token=${token}` } : {},
  });
}

describe('edge session gate for authenticated sections', () => {
  it('redirects a logged-out visitor to /login with 307', async () => {
    const response = await middleware(request('/dashboard'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://postfly.pl/login');
  });

  it('lets a valid session through', async () => {
    const response = await middleware(request('/analytics', sessionToken()));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('rejects an expired or tampered token', async () => {
    const expired = jwt.sign({ sub: 'u', email: 'user@example.com' }, SECRET, { expiresIn: -10 });
    expect((await middleware(request('/growth', expired))).status).toBe(307);
    expect((await middleware(request('/growth', `${sessionToken()}x`))).status).toBe(307);
  });

  it('never accepts the 2fa-pending token as a session', async () => {
    const pending = sessionToken('user@example.com', { purpose: '2fa-pending' });
    expect((await middleware(request('/dashboard', pending))).status).toBe(307);
  });

  it('does not gate public pages or the OAuth callback route handler', async () => {
    expect((await middleware(request('/'))).headers.get('x-middleware-next')).toBe('1');
    expect((await middleware(request('/login'))).headers.get('x-middleware-next')).toBe('1');
    expect(config.matcher).not.toContain('/social-accounts/:path*');
  });
});

describe('admin gate (unchanged behavior)', () => {
  it('lets an admin email through and blocks others', async () => {
    expect((await middleware(request('/api/admin/users', sessionToken('admin@example.com')))).headers.get('x-middleware-next')).toBe('1');
    expect((await middleware(request('/api/admin/users', sessionToken('user@example.com')))).status).toBe(403);
    expect((await middleware(request('/admin/users'))).status).toBe(307);
  });

  it('blocks the 2fa-pending token of an admin', async () => {
    const pending = sessionToken('admin@example.com', { purpose: '2fa-pending' });
    expect((await middleware(request('/api/admin/users', pending))).status).toBe(403);
  });
});
