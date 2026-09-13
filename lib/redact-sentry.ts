import type { ErrorEvent as SentryErrorEvent } from '@sentry/nextjs';
import { redactSensitiveValue } from '@/lib/redact';

// TASK-1.5.2: applies the same scrubbing as lib/server/observability.ts to whatever Sentry
// would otherwise send off-process - request headers/cookies/body, extra/context data, and
// exception messages (which can embed a token if e.g. an axios error's message includes the
// failed request's URL with a query-string token).
export function redactSentryEvent(event: SentryErrorEvent): SentryErrorEvent {
  if (event.request) {
    event.request = redactSensitiveValue(event.request) as typeof event.request;
  }

  if (event.extra) {
    event.extra = redactSensitiveValue(event.extra) as typeof event.extra;
  }

  if (event.contexts) {
    event.contexts = redactSensitiveValue(event.contexts) as typeof event.contexts;
  }

  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((exceptionValue) => ({
      ...exceptionValue,
      value: exceptionValue.value
        ? (redactSensitiveValue(exceptionValue.value) as string)
        : exceptionValue.value,
    }));
  }

  if (event.message) {
    event.message = redactSensitiveValue(event.message) as string;
  }

  return event;
}
