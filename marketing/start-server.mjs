// Local server for the landing recordings (2026-10-03). Runs the `build:test` output with
// NODE_ENV=test (so .env.production.local - production credentials - is never loaded; the
// prod-db-guard enforces that) and every value from .env exported explicitly, so the server and
// the Playwright seed agree on the database and JWT_SECRET. Refuses anything but a local database.
//   npm run build:test   (once, after code changes)
//   node marketing/start-server.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const env = { ...process.env };
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
}

if (!/localhost|127\.0\.0\.1/.test(env.DATABASE_URL ?? '')) {
  console.error('Refusing to start: DATABASE_URL in .env is not a local database.');
  process.exit(1);
}

env.NODE_ENV = 'test';
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3000'], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
