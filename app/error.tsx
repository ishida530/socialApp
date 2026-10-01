'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Route-level error boundary (2026-10-01): an error in one page shows this instead of a blank
// screen, keeps the app shell, reports to Sentry and lets the user retry.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center space-y-3">
        <h1 className="text-lg font-semibold text-foreground">Coś poszło nie tak</h1>
        <p className="text-sm text-muted-foreground">
          Nie udało się wyświetlić tej strony. Spróbuj ponownie - jeśli problem wraca, napisz do nas.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          Spróbuj ponownie
        </button>
      </div>
    </main>
  );
}
