import { afterEach, describe, expect, it } from 'vitest';
import { assertNotAccidentallyProductionDatabase, isLocalDatabaseHost } from '@/lib/server/prod-db-guard';

// BUG-001: `next build`/`next start` uruchomiony lokalnie bez jawnego NODE_ENV=test ładuje
// .env.production.local (jeśli istnieje na maszynie) z wyższym priorytetem niż .env - efekt:
// lokalny serwer łączy się z prawdziwą produkcyjną bazą. Ten guard ma to wykryć i zatrzymać
// serwer, zanim cokolwiek zdąży dotknąć produkcyjnych danych.
describe('prod-db-guard (BUG-001)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('classifies local database hosts as safe', () => {
    expect(isLocalDatabaseHost('localhost')).toBe(true);
    expect(isLocalDatabaseHost('127.0.0.1')).toBe(true);
    expect(isLocalDatabaseHost('host.docker.internal')).toBe(true);
    expect(isLocalDatabaseHost('postgres')).toBe(true);
  });

  it('classifies remote/production-looking hosts as unsafe', () => {
    expect(isLocalDatabaseHost('aws-1-eu-west-3.pooler.supabase.com')).toBe(false);
    expect(isLocalDatabaseHost('some-managed-db.example.com')).toBe(false);
  });

  it('throws when DATABASE_URL points at a non-local host and this is not a real Vercel deployment', () => {
    delete process.env.VERCEL_URL;
    delete process.env.DIRECT_URL;
    process.env.DATABASE_URL = 'postgresql://user:pass@aws-1-eu-west-3.pooler.supabase.com:6543/postgres';

    expect(() => assertNotAccidentallyProductionDatabase()).toThrow(/prod-db-guard/);
  });

  it('does not throw for a local DATABASE_URL', () => {
    delete process.env.VERCEL_URL;
    delete process.env.DIRECT_URL;
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/flowstate_test?schema=public';

    expect(() => assertNotAccidentallyProductionDatabase()).not.toThrow();
  });

  it('does not throw for a remote host when VERCEL_URL proves this is a real Vercel deployment', () => {
    process.env.VERCEL_URL = 'postfly-git-main-shoqers-projects.vercel.app';
    delete process.env.DIRECT_URL;
    process.env.DATABASE_URL = 'postgresql://user:pass@aws-1-eu-west-3.pooler.supabase.com:6543/postgres';

    expect(() => assertNotAccidentallyProductionDatabase()).not.toThrow();
  });
});
