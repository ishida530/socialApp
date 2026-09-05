import { test, expect } from '@playwright/test';
import { createAuthenticatedUser, BASE_URL } from './helpers';

// Coverage for GO_LIVE_PLAN.md sekcja A ("Billing: checkout mock, portal, plan switch") —
// previously zero Playwright coverage of the billing UI existed.
//
// The billing plan picker only renders when the app is built in commercial mode
// (NEXT_PUBLIC_APP_MODE is inlined into the client bundle at build time — see
// lib/app-mode.ts — so it can't be toggled per-request via page.route like server env
// vars can). This dev server may be running a personal-mode build (single-user, no
// billing UI at all), in which case this spec is skipped rather than false-failing.
const isCommercialBuild = process.env.NEXT_PUBLIC_APP_MODE === 'commercial';

test.skip(!isCommercialBuild, 'Requires a dev server built with NEXT_PUBLIC_APP_MODE=commercial');

// GET /billing/subscription is fully mocked (rather than hit for real) to pin the plan
// grid into a known, trial-free state — a freshly created user otherwise gets an
// automatic 7-day PRO trial (subscription.ts: resolveEffectivePlan), which would make
// the "current plan" buttons unpredictable depending on when the test runs.
const SUBSCRIPTION_SNAPSHOT = {
  subscription: {
    plan: 'FREE',
    basePlan: 'FREE',
    effectivePlan: 'FREE',
    status: 'ACTIVE',
    currentPeriodEnd: null,
    trial: null,
  },
  catalog: [
    { tier: 'FREE', title: 'Free', description: '', priceMonthly: '0 zł', priceYearly: '0 zł', features: [], limits: { social_accounts: 1, video_uploads: 3, publish_jobs: 3, max_schedule_ahead_hours: 72 } },
    { tier: 'STARTER', title: 'Starter', description: '', priceMonthly: '49 zł', priceYearly: '470 zł', features: [], limits: { social_accounts: 3, video_uploads: 20, publish_jobs: 20, max_schedule_ahead_hours: null } },
    { tier: 'PRO', title: 'Pro', description: '', priceMonthly: '99 zł', priceYearly: '950 zł', features: [], limits: { social_accounts: 10, video_uploads: 100, publish_jobs: 100, max_schedule_ahead_hours: null } },
    { tier: 'BUSINESS', title: 'Business', description: '', priceMonthly: '199 zł', priceYearly: '1900 zł', features: [], limits: { social_accounts: 25, video_uploads: null, publish_jobs: null, max_schedule_ahead_hours: null } },
  ],
  usage: {
    video_uploads: { count: 0, limit: 3 },
    publish_jobs: { count: 0, limit: 3 },
  },
};

test('starting a mock checkout for a paid plan redirects with a success banner', async ({ page, context }) => {
  await createAuthenticatedUser(context);

  await page.route('**/api/billing/subscription', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, body: JSON.stringify(SUBSCRIPTION_SNAPSHOT) });
    }
    return route.continue();
  });

  await page.route('**/api/billing/checkout', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        mode: 'mock',
        url: `${BASE_URL}/billing?checkout=success&plan=PRO`,
      }),
    }),
  );

  await page.goto(`${BASE_URL}/billing`);
  await page.getByRole('button', { name: 'Kup Pro' }).click();

  await expect(page).toHaveURL(/\/billing\?checkout=success/);
  await expect(page.getByText('Płatność zakończona pomyślnie.')).toBeVisible();
});

test('switching to the Free plan from a paid plan shows a confirmation toast', async ({ page, context }) => {
  await createAuthenticatedUser(context);

  await page.route('**/api/billing/subscription', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          ...SUBSCRIPTION_SNAPSHOT,
          subscription: { ...SUBSCRIPTION_SNAPSHOT.subscription, plan: 'PRO', effectivePlan: 'PRO' },
        }),
      });
    }
    if (route.request().method() === 'PATCH') {
      return route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
    }
    return route.continue();
  });

  await page.goto(`${BASE_URL}/billing`);
  await page.getByRole('button', { name: 'Przełącz na plan Free' }).click();

  await expect(page.getByText('Plan został przełączony na plan Free.')).toBeVisible();
});
