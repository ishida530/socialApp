import { describe, expect, it } from 'vitest';
import { redactSensitiveValue } from '@/lib/redact';

describe('redactSensitiveValue (TASK-1.5.2)', () => {
  it('redacts values whose key name looks sensitive, regardless of value shape', () => {
    const result = redactSensitiveValue({
      accessToken: 'plain-looking-value',
      refreshToken: 'another-plain-value',
      password: 'hunter2',
      Authorization: 'whatever',
      apiKey: 'x',
      userId: 'cuid123',
      caption: 'a normal caption',
    }) as Record<string, unknown>;

    expect(result.accessToken).toBe('[REDACTED]');
    expect(result.refreshToken).toBe('[REDACTED]');
    expect(result.password).toBe('[REDACTED]');
    expect(result.Authorization).toBe('[REDACTED]');
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.userId).toBe('cuid123');
    expect(result.caption).toBe('a normal caption');
  });

  it('redacts secret-shaped substrings inside free-text strings even with an innocuous key name', () => {
    const result = redactSensitiveValue({
      errorMessage: 'Request failed: Authorization header was Bearer abc123.def456-ghi',
    }) as Record<string, unknown>;

    expect(result.errorMessage).not.toContain('abc123.def456-ghi');
    expect(result.errorMessage).toContain('[REDACTED]');
  });

  it('redacts a JWT-shaped string', () => {
    // A fake, low-entropy 3-segment token (starts with "eyJ", dot-separated) - shaped enough to
    // exercise the JWT pattern without being a plausible real credential.
    const jwt = `eyJ${'x'.repeat(15)}.${'x'.repeat(15)}.${'x'.repeat(15)}`;
    const result = redactSensitiveValue({ note: `token was ${jwt}` }) as Record<string, unknown>;

    expect(result.note).not.toContain(jwt);
    expect(result.note).toContain('[REDACTED]');
  });

  it('redacts Stripe-style secret keys', () => {
    // Deliberately low-entropy fake values (repeated chars, not a plausible real secret) - a
    // realistic-looking fixture here previously tripped GitHub's own push-protection secret
    // scanner, which is a fair sign the regex is shaped correctly, but the fixture still needs
    // to not look like a real credential.
    const fakeApiKey = `sk_live_${'x'.repeat(20)}`;
    const fakeWebhookSecret = `whsec_${'x'.repeat(20)}`;
    const result = redactSensitiveValue({
      note: `used ${fakeApiKey} and ${fakeWebhookSecret}`,
    }) as Record<string, unknown>;

    expect(result.note).not.toContain(fakeApiKey);
    expect(result.note).not.toContain(fakeWebhookSecret);
  });

  it('redacts recursively through nested objects and arrays', () => {
    const result = redactSensitiveValue({
      jobs: [
        { id: '1', socialAccount: { accessToken: 'secret-1', handle: 'h1' } },
        { id: '2', socialAccount: { accessToken: 'secret-2', handle: 'h2' } },
      ],
    }) as any;

    expect(result.jobs[0].socialAccount.accessToken).toBe('[REDACTED]');
    expect(result.jobs[1].socialAccount.accessToken).toBe('[REDACTED]');
    expect(result.jobs[0].socialAccount.handle).toBe('h1');
  });

  it('redacts an Error instance down to a scrubbed name/message pair', () => {
    const error = new Error('token leaked: Bearer abc123.def456-ghi789');
    const result = redactSensitiveValue(error) as { name: string; message: string };

    expect(result.name).toBe('Error');
    expect(result.message).not.toContain('abc123.def456-ghi789');
  });

  it('leaves ordinary values untouched', () => {
    expect(redactSensitiveValue('hello')).toBe('hello');
    expect(redactSensitiveValue(42)).toBe(42);
    expect(redactSensitiveValue(null)).toBe(null);
    expect(redactSensitiveValue(undefined)).toBe(undefined);
    expect(redactSensitiveValue({ platform: 'FACEBOOK', count: 3 })).toEqual({
      platform: 'FACEBOOK',
      count: 3,
    });
  });
});
