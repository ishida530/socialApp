import { afterEach, describe, expect, it } from 'vitest';
import { isAdminEmail } from '@/lib/server/admin';

const ORIGINAL = process.env.ADMIN_EMAILS;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.ADMIN_EMAILS;
  } else {
    process.env.ADMIN_EMAILS = ORIGINAL;
  }
});

describe('isAdminEmail', () => {
  it('returns false when ADMIN_EMAILS is unset', () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail('owner@example.com')).toBe(false);
  });

  it('matches case-insensitively against a comma-separated list', () => {
    process.env.ADMIN_EMAILS = 'owner@example.com, other@example.com';
    expect(isAdminEmail('OWNER@example.com')).toBe(true);
    expect(isAdminEmail('other@example.com')).toBe(true);
    expect(isAdminEmail('stranger@example.com')).toBe(false);
  });

  it('returns false for null/undefined/empty email', () => {
    process.env.ADMIN_EMAILS = 'owner@example.com';
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail('')).toBe(false);
  });
});
