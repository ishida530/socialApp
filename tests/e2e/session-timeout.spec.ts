import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers';

// Regression test for UX_AUDIT.md finding #1 (sekcja 0): apiClient had no request
// timeout, so a hung /auth/me request left every authenticated page stuck forever on
// "Ładowanie sesji..." with no error and no way out. Fixed by adding a timeout to the
// axios instance (lib/api-client.ts) and a sessionError + retrySession escape hatch in
// AuthProvider (contexts/auth-context.tsx), surfaced as a "Spróbuj ponownie" button.
test('a hung /auth/me request surfaces a retryable error instead of hanging forever', async ({ page }) => {
  test.setTimeout(60_000);

  // Never call route.fulfill/continue/abort — the request hangs exactly like the real
  // dev-server stalls observed during the audit, forcing the client-side axios timeout
  // (not a fast server-side error) to be what resolves this.
  let hang = true;
  await page.route('**/api/auth/me', async (route) => {
    if (hang) {
      return; // intentionally never resolves this request
    }
    await route.fulfill({ status: 401, body: JSON.stringify({ message: 'Unauthorized' }) });
  });

  await page.goto(`${BASE_URL}/dashboard`);

  await expect(page.getByText('Ładowanie sesji...')).toBeVisible();

  // The axios timeout is 15s (DEFAULT_REQUEST_TIMEOUT_MS); the margin covers dev-server
  // (Fast Refresh) jitter on a cold route, not slack in the behavior under test. Note:
  // Playwright's `trace` recording measurably interferes with a route that never
  // resolves (observed 60s+ with tracing on vs. a steady ~17s with it off) — keep
  // tracing disabled in playwright.config.ts for this suite.
  await expect(page.getByText('Nie udało się połączyć z serwerem.')).toBeVisible({ timeout: 30_000 });
  const retryButton = page.getByRole('button', { name: 'Spróbuj ponownie' });
  await expect(retryButton).toBeVisible();

  // Let the retry succeed (as a real, fast /auth/me response would) and confirm the
  // app recovers — no longer stuck on the error screen.
  hang = false;
  await retryButton.click();
  await page.waitForURL('**/login', { timeout: 10_000 });
});
