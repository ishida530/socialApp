// Runs `prisma migrate deploy` only for PRODUCTION deployments (2026-10-01).
//
// Preview deployments (every PR) share the build command with production. Before this guard they
// ran migrations too - against whatever DATABASE_URL/DIRECT_URL the Preview environment has, which
// was the PRODUCTION database: a migration from an unmerged PR reached production before review.
// Now previews never migrate. If a Preview-only database is configured (Vercel env vars scoped to
// "Preview"), set PREVIEW_RUN_MIGRATIONS=1 there to migrate that separate database on each preview.
import { spawnSync } from 'node:child_process';

const vercelEnv = process.env.VERCEL_ENV;
const isProduction = vercelEnv === 'production';
const previewOptIn = vercelEnv === 'preview' && process.env.PREVIEW_RUN_MIGRATIONS === '1';

if (!isProduction && !previewOptIn) {
  console.log(`[vercel-migrate] VERCEL_ENV=${vercelEnv ?? 'unset'} - skipping prisma migrate deploy.`);
  process.exit(0);
}

console.log(`[vercel-migrate] VERCEL_ENV=${vercelEnv} - running prisma migrate deploy.`);
const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
