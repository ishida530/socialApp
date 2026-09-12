import { describe, expect, it } from 'vitest';
import { isBlockedHost } from '@/lib/server/test-network-guard';

// TASK-1.1.1: dokumentuje i potwierdza (czerwony test byłby tu, gdyby ktoś usunął
// installNetworkGuard() z tests/setup-env.ts) że środowisko testowe nigdy nie ma
// dostępu do prawdziwych platform OAuth - patrz docs/postfly-plan-projektu.md sekcja 3.
describe('test-network-guard (TASK-1.1.1)', () => {
  it('classifies real OAuth platform hosts as blocked', () => {
    expect(isBlockedHost('oauth2.googleapis.com')).toBe(true);
    expect(isBlockedHost('accounts.google.com')).toBe(true);
    expect(isBlockedHost('www.googleapis.com')).toBe(true);
    expect(isBlockedHost('open.tiktokapis.com')).toBe(true);
    expect(isBlockedHost('www.tiktok.com')).toBe(true);
    expect(isBlockedHost('graph.facebook.com')).toBe(true);
    expect(isBlockedHost('www.facebook.com')).toBe(true);
  });

  it('does not block unrelated hosts', () => {
    expect(isBlockedHost('localhost')).toBe(false);
    expect(isBlockedHost('example.com')).toBe(false);
    expect(isBlockedHost('api.resend.com')).toBe(false);
    expect(isBlockedHost(undefined)).toBe(false);
  });

  it('blocks a real fetch() attempt to a platform host before any network call is made', async () => {
    await expect(fetch('https://oauth2.googleapis.com/token')).rejects.toThrow(
      /test-network-guard/,
    );
  });

  it('blocks a real fetch() attempt to the TikTok token endpoint', async () => {
    await expect(fetch('https://open.tiktokapis.com/v2/oauth/token/')).rejects.toThrow(
      /test-network-guard/,
    );
  });
});
