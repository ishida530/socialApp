import path from 'node:path';
import { defineConfig } from '@playwright/test';

// Tests import server-side helpers (Prisma fixtures, JWT signing) directly, same as the
// Vitest integration suite (tests/setup-env.ts) — they need real env vars (DATABASE_URL,
// JWT_SECRET) loaded into this Node process, not just the browser under test.
process.loadEnvFile(path.resolve(process.cwd(), '.env'));

// Assumes the dev stack is already running locally (`npm run docker:up` + `npm run dev`),
// same as the Vitest integration suite — these are E2E regression tests against a real
// browser + real local Postgres/Redis, not something that spins up its own server.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  // These tests share one real dev server (a plain `next dev`, not a CI-grade prod
  // server) and one local Postgres — running them concurrently was observed to starve
  // the dev-server-timeout regression test of the very margin it needs, and only adds
  // noise for a two-test suite. One worker at a time.
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:3000',
  },
});
