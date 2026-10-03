import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, type Browser, type Page } from '@playwright/test';
import { TOKEN_COOKIE_NAME } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { DEMO_EMAIL, seedDemoAccount } from './demo-seed';

// Records the three "Produkt w akcji" clips (desktop 1280x800 and mobile 390x844) plus a poster
// frame for each, from the real app on the fictional demo account. Raw WebM files and the trim
// window go to .marketing-raw/; marketing/encode-showcase.mjs encodes them for the landing.

const RAW_DIR = path.resolve('.marketing-raw');
const VARIANTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
} as const;
type Variant = keyof typeof VARIANTS;

let token = '';

test.beforeAll(async () => {
  mkdirSync(RAW_DIR, { recursive: true });
  ({ token } = await seedDemoAccount());
});

async function record(
  browser: Browser,
  id: string,
  variant: Variant,
  scene: (page: Page, mark: { start: () => void; poster: () => Promise<void> }) => Promise<void>,
) {
  const viewport = VARIANTS[variant];
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: variant === 'mobile',
    hasTouch: variant === 'mobile',
    recordVideo: { dir: RAW_DIR, size: viewport },
  });
  await context.addCookies([{ name: TOKEN_COOKIE_NAME, value: token, url: 'http://localhost:3000', httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  const t0 = Date.now();
  let start = 0;

  await scene(page, {
    start: () => {
      start = (Date.now() - t0) / 1000;
    },
    poster: async () => {
      await page.screenshot({ path: path.join(RAW_DIR, `${id}-${variant}.png`) });
    },
  });

  const end = (Date.now() - t0) / 1000;
  const video = page.video();
  await context.close();
  const rawPath = await video!.path();
  writeFileSync(path.join(RAW_DIR, `${id}-${variant}.json`), JSON.stringify({ raw: rawPath, start, end }, null, 2));
}

// Real-time pauses: the recording runs at wall-clock speed.
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function openReady(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState('networkidle');
  // Fonts, images and the first data fetches settle before the clip starts.
  await pause(800);
}

for (const variant of Object.keys(VARIANTS) as Variant[]) {
  test(`opis-ai ${variant}`, async ({ browser }) => {
    // The previous recording's typed edit was autosaved - start every take from the AI's own text.
    const drafts = await prisma.publishJob.findMany({
      where: { status: 'DRAFT', video: { user: { email: DEMO_EMAIL } } },
      select: { id: true, aiCaption: true },
    });
    for (const draft of drafts) {
      if (draft.aiCaption) await prisma.publishJob.update({ where: { id: draft.id }, data: { caption: draft.aiCaption } });
    }

    await record(browser, 'opis-ai', variant, async (page, mark) => {
      await openReady(page, '/dashboard');
      mark.start();
      await pause(700);
      await page.getByRole('button', { name: /Nowy post/ }).first().click();
      await pause(1100);
      await page.getByRole('button', { name: 'Wróć do posta' }).click();
      const caption = page.locator('#post-composer textarea').first();
      await caption.waitFor();
      if (variant === 'mobile') {
        // On a phone the photo preview fills the screen - bring the AI caption into view.
        await pause(900);
        await caption.evaluate((node) => node.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      }
      await pause(2200);
      await mark.poster();

      // Each platform has its own AI caption.
      for (const name of ['Instagram', 'LinkedIn', 'Facebook']) {
        const tab = page.locator('#post-composer').getByRole('button', { name: new RegExp(`^${name}`) }).first();
        if (await tab.isVisible().catch(() => false)) {
          await tab.scrollIntoViewIfNeeded();
          await tab.click();
          await pause(1300);
        }
      }

      // The user edits the suggestion.
      await caption.scrollIntoViewIfNeeded();
      await caption.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type(' Do zobaczenia w piątek!', { delay: 45 });
      await pause(1400);
    });
  });

  test(`harmonogram ${variant}`, async ({ browser }) => {
    await record(browser, 'harmonogram', variant, async (page, mark) => {
      await openReady(page, '/schedule');
      const scheduledTab = page.getByRole('button', { name: /Zaplanowane \(\d+\)/ });
      await scheduledTab.scrollIntoViewIfNeeded();
      await pause(300);
      mark.start();
      await pause(600);
      await scheduledTab.click();
      await pause(1200);
      await page.mouse.wheel(0, variant === 'mobile' ? 420 : 320);
      await pause(1500);
      await mark.poster();
      await page.mouse.wheel(0, variant === 'mobile' ? 420 : 320);
      await pause(1800);
    });
  });

  test(`rozwoj ${variant}`, async ({ browser }) => {
    await record(browser, 'rozwoj', variant, async (page, mark) => {
      await openReady(page, '/growth');
      const heading = page.getByText('Wzrost obserwujących');
      await heading.evaluate((node) => node.scrollIntoView({ block: 'start' }));
      await page.mouse.wheel(0, -90);
      await pause(300);
      mark.start();
      await pause(1500);
      await mark.poster();
      await page.mouse.wheel(0, variant === 'mobile' ? 520 : 200);
      await pause(1800);
      await page.mouse.wheel(0, variant === 'mobile' ? -520 : -200);
      await pause(1800);
    });
  });
}
