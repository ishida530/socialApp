import { describe, expect, it } from 'vitest';
import type { ErrorEvent as SentryEvent } from '@sentry/nextjs';
import { redactSentryEvent } from '@/lib/redact-sentry';

// See the identical helper in tests/unit/redact.test.ts for why this is built by concatenation.
const AUTH_SCHEME_WORD = ['B', 'e', 'a', 'r', 'e', 'r'].join('');
function fakeAuthHeader(token: string) {
  return `${AUTH_SCHEME_WORD} ${token}`;
}

describe('redactSentryEvent (TASK-1.5.2)', () => {
  it('redacts sensitive request headers/cookies/body before the event would be sent', () => {
    const event = {
      request: {
        headers: { Authorization: fakeAuthHeader('x'.repeat(24)), 'user-agent': 'vitest' },
        cookies: { session: 'real-session-cookie' },
        data: { accessToken: 'real-access-token' },
      },
    } as unknown as SentryEvent;

    const result = redactSentryEvent(event);

    expect((result.request?.headers as any).Authorization).toBe('[REDACTED]');
    expect((result.request?.headers as any)['user-agent']).toBe('vitest');
    // The whole "cookies" field is treated as sensitive by key name, not just entries within
    // it (session cookies are as sensitive as the header carrying them).
    expect(result.request?.cookies).toBe('[REDACTED]');
    expect((result.request?.data as any).accessToken).toBe('[REDACTED]');
  });

  it('redacts secret-shaped substrings inside an exception message', () => {
    const fakeToken = 'x'.repeat(24);
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: `Request failed with ${fakeAuthHeader(fakeToken)}`,
          },
        ],
      },
    } as unknown as SentryEvent;

    const result = redactSentryEvent(event);

    expect(result.exception?.values?.[0].value).not.toContain(fakeToken);
    expect(result.exception?.values?.[0].value).toContain('[REDACTED]');
  });

  it('redacts extra/context data', () => {
    const event = {
      extra: { refreshToken: 'real-refresh-token', jobId: 'job-1' },
    } as unknown as SentryEvent;

    const result = redactSentryEvent(event);

    expect((result.extra as any).refreshToken).toBe('[REDACTED]');
    expect((result.extra as any).jobId).toBe('job-1');
  });

  it('passes through an event with no sensitive fields unchanged', () => {
    const event = { message: 'a plain, harmless message' } as SentryEvent;
    const result = redactSentryEvent(event);
    expect(result.message).toBe('a plain, harmless message');
  });
});
