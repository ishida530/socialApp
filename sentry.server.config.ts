import * as Sentry from '@sentry/nextjs';
import { redactSentryEvent } from '@/lib/redact-sentry';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === 'production',
  // TASK-1.5.2: scrub secrets/PII before an event leaves the process, not just before console
  // logging - request headers/cookies/body and exception messages can carry them too.
  beforeSend: redactSentryEvent,
});
