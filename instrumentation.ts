import * as Sentry from '@sentry/nextjs';

export async function register() {
  // BUG-001: pierwsza rzecz przy starcie serwera, przed czymkolwiek innym - jeśli ktoś
  // odpalił lokalnie next build/next start bez NODE_ENV=test, a na tej maszynie leży
  // .env.production.local (np. z `vercel env pull`), Next.js załadowałby je z wyższym
  // priorytetem niż .env i serwer cicho połączyłby się z prawdziwą bazą produkcyjną.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertNotAccidentallyProductionDatabase } = await import('./lib/server/prod-db-guard');
    assertNotAccidentallyProductionDatabase();
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }

  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  const { verifyMailProviderOnce } = await import('./lib/mail/service');
  await verifyMailProviderOnce();
}

export const onRequestError = Sentry.captureRequestError;
