"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { trackLandingEvent } from '@/lib/landing-events';
import { BrandLogo } from '@/components/BrandLogo';
import { GoogleGLogo } from '@/components/BrandIcons';

export default function LoginPage() {
  const router = useRouter();
  const { login, completeTwoFactorLogin, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hpWebsite, setHpWebsite] = useState('');
  const [formStartedAt] = useState(() => Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [source, setSource] = useState('');
  const fromLanding = source === 'landing';

  // EPIC 9 TASK-9.3 (2FA, 2026-09-15): set once the password step succeeds for an account with
  // 2FA enabled - switches the form to the code-entry step instead of navigating to /dashboard.
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  // 2026-09-16 "remember this device": defaults to checked - the owner explicitly asked for 2FA
  // to NOT prompt on every login, so opting out (unchecking) is the deliberate action, not opting in.
  const [rememberDevice, setRememberDevice] = useState(true);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

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
      const result = await login({
        email,
        password,
        hpWebsite,
        formStartedAt,
      });

      if (result.requiresTwoFactor) {
        setPendingToken(result.pendingToken);
        return;
      }

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

  const onSubmitTwoFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingToken) {
      return;
    }

    try {
      setIsSubmitting(true);
      await completeTwoFactorLogin(pendingToken, twoFactorCode, rememberDevice);
      toast.success('Zalogowano pomyślnie.');
      router.replace('/dashboard');
    } catch {
      toast.error('Nieprawidłowy kod. Spróbuj ponownie.');
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

  if (pendingToken) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <form
          onSubmit={onSubmitTwoFactor}
          className="w-full max-w-md bg-card border border-border rounded-xl p-8 space-y-5"
        >
          <div className="flex justify-center">
            <BrandLogo className="h-12 w-auto" priority />
          </div>

          <div>
            <h1 className="text-2xl font-semibold text-foreground">Weryfikacja dwuetapowa</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Wpisz 6-cyfrowy kod z aplikacji uwierzytelniającej (albo jeden z zapasowych kodów).
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-foreground">Kod</label>
            <input
              autoFocus
              value={twoFactorCode}
              onChange={(event) => setTwoFactorCode(event.target.value)}
              type="text"
              inputMode="numeric"
              required
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-center tracking-[0.3em]"
              placeholder="123456"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={(event) => setRememberDevice(event.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>Zapamiętaj to urządzenie na 30 dni - nie będę pytać o kod przy kolejnych logowaniach.</span>
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {isSubmitting ? 'Weryfikacja...' : 'Zweryfikuj'}
          </button>

          <button
            type="button"
            onClick={() => {
              setPendingToken(null);
              setTwoFactorCode('');
            }}
            className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
          >
            ← Wróć do logowania
          </button>
        </form>
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
            value={hpWebsite}
            onChange={(event) => setHpWebsite(event.target.value)}
            type="text"
            autoComplete="new-password"
            tabIndex={-1}
            inputMode="none"
            data-lpignore="true"
            data-1p-ignore="true"
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
              Zapomniałeś hasła?
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
          // Google sign-in branding (light theme): white, #747775 border, #1F1F1F text, unmodified "G".
          className="w-full py-2.5 rounded-lg border border-[#747775] bg-white text-[#1F1F1F] font-medium hover:bg-gray-50 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <GoogleGLogo className="h-5 w-5" />
          {isGoogleSubmitting ? 'Przekierowanie do Google...' : 'Zaloguj się przez Google'}
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
