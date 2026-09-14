import { describe, expect, it } from 'vitest';
import { redactPotentialPii, redactPotentialPiiKeepingEmail } from '@/lib/server/smart-autopilot/safety';

describe('redactPotentialPii', () => {
  it('redacts email, phone, and ID-like digit strings', () => {
    const result = redactPotentialPii('kontakt: jan@example.com, tel 512-345-678, id 123456789');
    expect(result).not.toContain('jan@example.com');
    expect(result).not.toContain('512-345-678');
    expect(result).toContain('[redacted-email]');
    expect(result).toContain('[redacted-phone]');
  });
});

describe('redactPotentialPiiKeepingEmail', () => {
  it('keeps the email address intact but still redacts phone and ID-like digit strings', () => {
    const result = redactPotentialPiiKeepingEmail('dodaj fana jan@example.com, tel 512-345-678, id 123456789');
    expect(result).toContain('jan@example.com');
    expect(result).not.toContain('512-345-678');
    expect(result).toContain('[redacted-phone]');
  });
});
