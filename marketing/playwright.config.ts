import path from 'node:path';
import { defineConfig } from '@playwright/test';

// Landing "Produkt w akcji" recordings (2026-10-03) - not a test suite. Run against a local
// PRODUCTION build (`npm run build && npm start`) so no dev overlay shows up in the clips:
//   npm run marketing:capture
// Seeds the fictional demo account into the LOCAL database (marketing/demo-seed.ts), records the
// clips, then marketing/encode-showcase.mjs turns them into the WebM/MP4/WebP files in
// public/landing/showcase/.
process.loadEnvFile(path.resolve(process.cwd(), '.env'));

export default defineConfig({
  testDir: '.',
  testMatch: '*.capture.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  outputDir: '../.marketing-output',
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    colorScheme: 'light',
    headless: false,
  },
});
