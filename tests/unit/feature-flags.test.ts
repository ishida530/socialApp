import { afterEach, describe, expect, it } from 'vitest';
import { isFeatureEnabled } from '@/lib/feature-flags';

// TASK-6.5 / TASK-10.4 (2026-09-15) - proves the gate is a real technical check against the env
// var, not decorative: an unlisted flag is off, a listed one is on, and the comma-separated list
// is parsed correctly (whitespace, empty entries, unset var).

const ORIGINAL = process.env.NEXT_PUBLIC_FEATURE_FLAGS;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.NEXT_PUBLIC_FEATURE_FLAGS;
  } else {
    process.env.NEXT_PUBLIC_FEATURE_FLAGS = ORIGINAL;
  }
});

describe('isFeatureEnabled', () => {
  it('is false when the env var is unset', () => {
    delete process.env.NEXT_PUBLIC_FEATURE_FLAGS;
    expect(isFeatureEnabled('new-schedule-ui')).toBe(false);
  });

  it('is false for a flag not in the allowlist', () => {
    process.env.NEXT_PUBLIC_FEATURE_FLAGS = 'other-flag';
    expect(isFeatureEnabled('new-schedule-ui')).toBe(false);
  });

  it('is true for a flag in the allowlist', () => {
    process.env.NEXT_PUBLIC_FEATURE_FLAGS = 'new-schedule-ui';
    expect(isFeatureEnabled('new-schedule-ui')).toBe(true);
  });

  it('parses a comma-separated list with surrounding whitespace and empty entries', () => {
    process.env.NEXT_PUBLIC_FEATURE_FLAGS = ' new-schedule-ui ,, other-flag ';
    expect(isFeatureEnabled('new-schedule-ui')).toBe(true);
    expect(isFeatureEnabled('other-flag')).toBe(true);
    expect(isFeatureEnabled('')).toBe(false);
  });
});
