"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { trackLandingEvent } from '@/lib/landing-events';
import { BrandLogo } from '@/components/BrandLogo';
import { apiClient } from '@/lib/api-client';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hpWebsite, setHpWebsite] = useState('');
  const [formStartedAt] = useState(() => Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [source, setSource] = useState('');
  const [intent, setIntent] = useState('');
  const fromLanding = source === 'landing';

  // Checked up front so a closed registration (APP_MODE=personal, 1 account already
  // exists) is communicated before the user fills in the whole form, not only after
  // submitting it and getting the same message back from the API.
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSource(params.get('source') ?? '');
    setIntent(params.get('intent') ?? '');
  }, []);

  useEffect(() => {
    let cancelled = false;

    apiClient
      .get<{ open: boolean }>('/auth/register-status')
      .then((response) => {
        if (!cancelled) {
          setRegistrationOpen(response.data.open);
        }
      })
      .catch(() => {
        // Can't confirm either way — don't block a real user over a flaky status
        // check; the POST endpoint still enforces this as the actual source of truth.
        if (!cancelled) {
          setRegistrationOpen(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const intentLabel =
    intent === 'pro'
      ? 'Chcesz zacząć od planu Pro.'
      : intent === 'starter'
        ? 'Chcesz zacząć od planu Starter.'
        : intent === 'business'
          ? 'Chcesz zacząć od planu Business.'
          : 'Zaczynasz darmowy okres próbny.';

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      await register({
        name,
        email,
        password,
        hpWebsite,
        formStartedAt,
      });

      if (fromLanding) {
        trackLandingEvent({
          event: 'landing_cta_click',
          cta: 'register_success',
          source: 'landing',
          plan: intent || 'trial',
        });
      }

      toast.success('Konto utworzone.');

      if (fromLanding && (intent === 'starter' || intent === 'pro' || intent === 'business')) {
        router.replace('/billing');
        return;
      }

      router.replace('/dashboard');
    } catch {
      toast.error('Rejestracja nie powiodła się.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (registrationOpen === false) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-card border border-border rounded-xl p-8 space-y-4 text-center">
          <div className="flex justify-center">
            <BrandLogo className="h-12 w-auto" priority />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Rejestracja jest obecnie zamknięta</h1>
          <p className="text-sm text-muted-foreground">
            Ta appka działa dziś w trybie jednoosobowym — konto już istnieje, więc nowe rejestracje są wyłączone.
          </p>
          <Link
            href="/login"
            className="inline-block px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            Przejdź do logowania
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md bg-card border border-border rounded-xl p-8 space-y-5"
      >
        <div className="flex justify-center">
          <BrandLogo className="h-12 w-auto" priority />
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-foreground">Rejestracja</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Utwórz konto i zacznij publikować
          </p>
          {fromLanding ? (
            <p className="mt-2 text-xs text-primary">{intentLabel}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true" htmlFor="register-company-website">
            Company website
          </label>
          <input
            id="register-company-website"
            name="companyWebsite"
            value={hpWebsite}
            onChange={(event) => setHpWebsite(event.target.value)}
            type="text"
            autoComplete="off"
            tabIndex={-1}
            className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
            aria-hidden="true"
          />

          <label className="text-sm text-foreground">Imię i nazwisko</label>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            type="text"
            required
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            placeholder="Jan Kowalski"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-foreground">Email</label>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            placeholder="jan@postfly.app"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-foreground">Hasło</label>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            minLength={8}
            required
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            placeholder="Minimum 8 znaków"
          />
          <p className="text-xs text-muted-foreground">Hasło musi mieć co najmniej 8 znaków.</p>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {isSubmitting ? 'Tworzenie konta...' : 'Utwórz konto'}
        </button>

        <p className="text-sm text-muted-foreground text-center">
          Masz już konto?{' '}
          <Link className="text-primary hover:underline" href="/login">
            Zaloguj się
          </Link>
        </p>
      </form>
    </main>
  );
}
