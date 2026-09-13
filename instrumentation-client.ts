import * as Sentry from '@sentry/nextjs';
import { redactSentryEvent } from '@/lib/redact-sentry';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === 'production',
  // TASK-1.5.2: see sentry.server.config.ts. Client-side matters too - a thrown error whose
  // message embeds a query string or header value could otherwise leave the browser as-is.
  beforeSend: redactSentryEvent,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
