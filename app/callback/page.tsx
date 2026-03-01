"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

type CallbackState = 'loading' | 'success' | 'error';

export default function CallbackPage() {
  const [status, setStatus] = useState<CallbackState>('loading');
  const [message, setMessage] = useState('Trwa łączenie konta...');

  useEffect(() => {
    const run = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const platform = urlParams.get('platform')?.toLowerCase() ?? '';
      const code = urlParams.get('code') ?? '';
      const state = urlParams.get('state') ?? '';
      const redirectedStatus = urlParams.get('status');
      const redirectedMessage = urlParams.get('message');

      if (redirectedStatus === 'success' || redirectedStatus === 'error') {
        const finalMessage =
          redirectedMessage ||
          (redirectedStatus === 'success'
            ? 'Konto zostało połączone.'
            : 'Połączenie konta nie powiodło się.');

        setStatus(redirectedStatus);
        setMessage(finalMessage);

        if (redirectedStatus === 'success') {
          toast.success(finalMessage);
        } else {
          toast.error(finalMessage);
        }

        return;
      }

      if (!platform || !code) {
        setStatus('error');
        setMessage('Brak wymaganych parametrów callback (platform/code).');
        return;
      }

      try {
        const query = new URLSearchParams({ code });
        if (state) {
          query.set('state', state);
        }

        const response = await apiClient.get<{
          message?: string;
        }>(`/social-accounts/callback/${platform}?${query.toString()}`);
        const payload = response.data;

        setStatus('success');
        setMessage(payload.message || 'Konto zostało połączone.');
        toast.success(payload.message || 'Konto zostało połączone.');
      } catch (error) {
        setStatus('error');
        setMessage(
          error instanceof Error
            ? error.message
            : 'Połączenie konta nie powiodło się.',
        );
        toast.error('Połączenie konta nie powiodło się.');
      }
    };

    run();
  }, []);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-card border border-border rounded-xl p-8 text-center space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">FlowState OAuth</h1>
        <p className="text-muted-foreground">{message}</p>

        <div className="pt-2">
          {status === 'loading' && (
            <p className="text-sm text-muted-foreground">Trwa finalizacja autoryzacji...</p>
          )}
          {status === 'success' && (
            <p className="text-sm text-green-500">Autoryzacja zakończona sukcesem.</p>
          )}
          {status === 'error' && (
            <p className="text-sm text-destructive">Autoryzacja zakończona błędem.</p>
          )}
        </div>

        <Link
          href="/"
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          Powrót do Dashboard
        </Link>
      </div>
    </main>
  );
}
