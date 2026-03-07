"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { trackLandingEvent } from '@/lib/landing-events';
import { BrandLogo } from '@/components/BrandLogo';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hpWebsite, setHpWebsite] = useState('');
  const [formStartedAt] = useState(() => Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [source, setSource] = useState('');
  const fromLanding = source === 'landing';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSource(params.get('source') ?? '');
  }, []);

  useEffect(() => {
    if (!fromLanding) {
      return;
    }

    trackLandingEvent({
      event: 'landing_cta_click',
      cta: 'login_view',
      source: 'landing',
    });
  }, [fromLanding]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      await login({
        email,
        password,
        hpWebsite,
        formStartedAt,
      });

      if (fromLanding) {
        trackLandingEvent({
          event: 'landing_cta_click',
          cta: 'login_success',
          source: 'landing',
        });
      }

      toast.success('Zalogowano pomyślnie.');
      router.replace('/dashboard');
    } catch {
      toast.error('Logowanie nie powiodło się. Sprawdź e-mail i hasło.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = () => {
    try {
      setIsGoogleSubmitting(true);
      if (fromLanding) {
        trackLandingEvent({
          event: 'landing_cta_click',
          cta: 'login_google_start',
          source: 'landing',
          href: '/api/auth/google',
        });
      }
      window.location.assign('/api/auth/google');
    } catch {
      setIsGoogleSubmitting(false);
      toast.error('Nie udało się rozpocząć logowania przez Google.');
    }
  };

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
          <h1 className="text-2xl font-semibold text-foreground">Logowanie</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Zaloguj się do panelu Postfly
          </p>
        </div>

        <div className="space-y-2">
          <label className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true" htmlFor="login-company-website">
            Company website
          </label>
          <input
            id="login-company-website"
            name="companyWebsite"
            value={hpWebsite}
            onChange={(event) => setHpWebsite(event.target.value)}
            type="text"
            autoComplete="off"
            tabIndex={-1}
            className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
            aria-hidden="true"
          />

          <label className="text-sm text-foreground">Email</label>
          <input
            autoFocus
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
            required
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            placeholder="••••••••"
          />
          <div className="flex justify-end">
            <Link className="text-sm text-primary hover:underline" href="/forgot-password">
              Zapomniales hasla?
            </Link>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {isSubmitting ? 'Logowanie...' : 'Zaloguj'}
        </button>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isSubmitting || isGoogleSubmitting}
          className="w-full py-2.5 rounded-lg border border-primary/40 text-foreground hover:bg-primary/10 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" role="img">
            <path
              fill="#EA4335"
              d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.7 2.3 2.4 6.6 2.4 11.9S6.7 21.5 12 21.5c6.9 0 9.1-4.8 9.1-7.3 0-.5-.1-.9-.1-1.2z"
            />
            <path
              fill="#34A853"
              d="M2.4 7.6l3.2 2.3c.9-1.7 2.6-2.9 4.4-2.9 1.9 0 3.1.8 3.8 1.5l2.6-2.5C14.6 3.3 12.4 2.3 10 2.3c-3.8 0-7 2.1-8.6 5.3z"
            />
            <path
              fill="#FBBC05"
              d="M10 21.5c2.3 0 4.3-.8 5.8-2.3l-2.7-2.2c-.7.5-1.7.9-3.1.9-2.6 0-4.8-1.7-5.5-4.1l-3.3 2.5c1.6 3.2 4.9 5.2 8.8 5.2z"
            />
            <path
              fill="#4285F4"
              d="M21.1 14.2c0-.5-.1-.9-.1-1.2H10v3.9h6.3c-.3 1-1 1.9-2 2.6l2.7 2.2c2-1.8 3.1-4.5 3.1-7.5z"
            />
          </svg>
          {isGoogleSubmitting ? 'Przekierowanie do Google...' : 'Zaloguj przez Google'}
        </button>

        <p className="text-sm text-muted-foreground text-center">
          Nie masz konta?{' '}
          <Link className="text-primary hover:underline" href="/register">
            Zarejestruj się
          </Link>
        </p>
      </form>
    </main>
  );
}
