import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';

// Review screenshots of the landing page (navbar, product showcase, sections) at desktop, tablet
// and phone widths, light and dark - for the UX and founder review before shipping.
const OUT = path.resolve('.marketing-raw/landing-preview');

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone', width: 375, height: 812 },
] as const;

for (const viewport of VIEWPORTS) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`landing ${viewport.name} ${scheme}`, async ({ browser }) => {
      mkdirSync(OUT, { recursive: true });
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: scheme,
        isMobile: viewport.name === 'phone',
        hasTouch: viewport.name === 'phone',
      });
      const page = await context.newPage();
      const shot = (name: string) => page.screenshot({ path: path.join(OUT, `${viewport.name}-${scheme}-${name}.png`) });

      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1200);
      await shot('1-hero');

      await page.evaluate(() => window.scrollTo(0, 600));
      await page.waitForTimeout(600);
      await shot('2-scrolled-header');

      await page.locator('#produkt').scrollIntoViewIfNeeded();
      await page.evaluate(() => document.getElementById('produkt')?.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(3000);
      await shot('3-produkt');

      await page.evaluate(() => document.getElementById('funkcje')?.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(800);
      await shot('4-funkcje');

      await page.evaluate(() => document.getElementById('pricing')?.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(800);
      await shot('5-cennik');

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(800);
      await shot('6-stopka');

      if (viewport.name !== 'desktop') {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.getByRole('button', { name: 'Otwórz menu' }).click();
        await page.waitForTimeout(700);
        await shot('7-menu');
      }

      await context.close();
    });
  }
}
