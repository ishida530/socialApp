import { afterEach, describe, expect, it, vi } from 'vitest';
import { logError, logEvent } from '@/lib/server/observability';

// TASK-1.5.2 DoD literally: "test symulujący błąd z tokenem w danych wejściowych — token nie
// pojawia się w zapisanym logu" (a test simulating an error with a token in the input data -
// the token does not appear in the saved log).

// A fake, low-entropy placeholder (not a real Google OAuth token prefix, which GitHub's own
// push-protection secret scanner otherwise flags) - shaped enough to exercise the redaction
// path (via the sensitive key name below, not this string's own shape).
const REAL_LOOKING_TOKEN = `fake-test-access-token-${'x'.repeat(20)}`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logEvent/logError redact secrets before writing (TASK-1.5.2)', () => {
  it('does not print a raw accessToken value passed in metadata', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    logEvent('social-accounts', 'token-refreshed', {
      userId: 'user-1',
      accessToken: REAL_LOOKING_TOKEN,
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const written = infoSpy.mock.calls[0][0] as string;
    expect(written).not.toContain(REAL_LOOKING_TOKEN);
    expect(written).toContain('[REDACTED]');
  });

  it('does not print a token embedded in a caught error message', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const error = new Error(`Upstream rejected request with Bearer ${REAL_LOOKING_TOKEN}`);
    logError('social-accounts', 'refresh-failed', error, { userId: 'user-1' });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const written = errorSpy.mock.calls[0][0] as string;
    expect(written).not.toContain(REAL_LOOKING_TOKEN);
    expect(written).toContain('[REDACTED]');
  });

  it('still logs non-sensitive fields normally, so logs stay useful for debugging', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    logEvent('publish-processor', 'job-succeeded', {
      jobId: 'job-1',
      platform: 'FACEBOOK',
      accessToken: REAL_LOOKING_TOKEN,
    });

    const written = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(written.metadata.jobId).toBe('job-1');
    expect(written.metadata.platform).toBe('FACEBOOK');
    expect(written.metadata.accessToken).toBe('[REDACTED]');
  });
});
