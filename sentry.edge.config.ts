import * as Sentry from '@sentry/nextjs';
import { redactSentryEvent } from '@/lib/redact-sentry';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === 'production',
  // TASK-1.5.2: see sentry.server.config.ts.
  beforeSend: redactSentryEvent,
});
