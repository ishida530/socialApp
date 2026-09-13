// TASK-1.5.2: defense-in-depth scrubbing of secrets/PII before anything is written to a log
// (lib/server/observability.ts, the app's actual "error_log" - there's no DB table by that
// name) or sent to Sentry (sentry.*.config.ts / instrumentation-client.ts). No call site in
// this app currently logs a raw token intentionally - this exists for the case some future or
// indirect call path does (a caught error whose message embeds a request body, an object spread
// into metadata that happened to include an access token field), so a mistake three call frames
// away doesn't silently ship a live credential into a log stream or a third-party dashboard.
//
// No Node-only APIs (crypto, fs, ...) - this also runs in the browser Sentry client config.

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|passwd|apikey|api_key|authorization|auth|cookie|privatekey|signingkey|encryptionkey|credential/i;

// Secret-SHAPED substrings inside free-text strings (error messages, stack traces) where the
// surrounding key name gives no hint at all - a JWT, a "Bearer <...>" header value, or a
// long base64/hex-looking run that's very unlikely to be anything else.
const SECRET_SHAPED_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9\-_.]+/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{10,}\b/gi, // Stripe API keys
  /\bwhsec_[A-Za-z0-9]{10,}\b/gi, // Stripe webhook signing secrets
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, // long base64-looking run
  /\b[A-Fa-f0-9]{32,}\b/g, // long hex-looking run
];

const REDACTED = '[REDACTED]';

function redactString(value: string): string {
  let result = value;
  for (const pattern of SECRET_SHAPED_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

const MAX_DEPTH = 6;

export function redactSensitiveValue(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH || value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item, depth + 1));
  }

  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = REDACTED;
        continue;
      }
      result[key] = redactSensitiveValue(val, depth + 1);
    }
    return result;
  }

  return value;
}
