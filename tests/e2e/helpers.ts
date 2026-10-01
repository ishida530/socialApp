import type { BrowserContext } from '@playwright/test';
import { TOKEN_COOKIE_NAME } from '@/lib/server/auth';
import { createTestUser } from '@/tests/helpers/fixtures';

export const BASE_URL = 'http://localhost:3000';

// Authenticates a Playwright context by minting a real JWT (same helper the Vitest
// integration tests use) and setting it as a cookie, the same way a successful
// /api/auth/login response would — skips the login UI (and its honeypot/rate-limit)
// entirely, which E2E tests that aren't *about* login shouldn't have to fight.
export async function createAuthenticatedUser(context: BrowserContext) {
  const { user, token } = await createTestUser();
  await context.addCookies([
    {
      name: TOKEN_COOKIE_NAME,
      value: token,
      url: BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  return user;
}

// For tests that MOCK /api/auth/login or /api/auth/register: the real endpoints answer with a
// session cookie, and since 2026-10-01 /dashboard is gated by the session on the edge (middleware)
// and on the server - a mocked login without that cookie can no longer reach it. Call this inside
// the mocked route handler, right before fulfilling, to set a real (test-user) session cookie the
// same way the real endpoint would. Returns the user for cleanup.
export async function grantRealSessionCookie(context: BrowserContext) {
  return createAuthenticatedUser(context);
}
