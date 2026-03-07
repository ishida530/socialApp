"use client";

import Link from 'next/link';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

const MIN_PASSWORD_LENGTH = 8;

type ResetPasswordFormProps = {
  token: string;
};

function parseRetryAfterSeconds(raw: string | undefined) {
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.ceil(parsed);
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hpWebsite, setHpWebsite] = useState('');
  const [formStartedAt] = useState(() => Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      toast.error('Brak tokenu resetu hasla. Uzyj linku z wiadomosci e-mail.');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Haslo musi miec co najmniej ${MIN_PASSWORD_LENGTH} znakow.`);
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Hasla nie sa identyczne.');
      return;
    }

    try {
      setIsSubmitting(true);
      await apiClient.post('/auth/reset-password', {
        token,
        password,
        hpWebsite,
        formStartedAt,
      });
      toast.success('Haslo zostalo ustawione. Mozesz sie teraz zalogowac.');
      router.replace('/login');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          const retryAfter = parseRetryAfterSeconds(error.response.headers?.['retry-after'] as string | undefined);
          if (retryAfter) {
            toast.error(`Za duzo prob. Sprobuj ponownie za ${retryAfter} s.`);
          } else {
            toast.error('Za duzo prob. Sprobuj ponownie pozniej.');
          }
          return;
        }

        if (error.response?.status === 400) {
          // 400 messages are already shown by global apiClient interceptor.
          return;
        }
      }

      toast.error('Nie udalo sie zresetowac hasla. Link mogl wygasnac.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md bg-card border border-border rounded-xl p-8 space-y-5"
      >
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Ustaw nowe haslo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Wpisz nowe haslo do swojego konta.
          </p>
          {!token ? (
            <p className="text-sm text-red-500 mt-2">
              Ten link jest nieprawidlowy. Wygeneruj nowy link resetu hasla.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true" htmlFor="reset-company-website">
            Company website
          </label>
          <input
            id="reset-company-website"
            name="companyWebsite"
            value={hpWebsite}
            onChange={(event) => setHpWebsite(event.target.value)}
            type="text"
            autoComplete="off"
            tabIndex={-1}
            className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
            aria-hidden="true"
          />

          <label className="text-sm text-foreground">Nowe haslo</label>
          <input
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            disabled={!token}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            placeholder="••••••••"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-foreground">Powtorz haslo</label>
          <input
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            disabled={!token}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !token}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {isSubmitting ? 'Zapisywanie...' : 'Zapisz nowe haslo'}
        </button>

        <p className="text-sm text-muted-foreground text-center">
          <Link className="text-primary hover:underline" href="/login">
            Wroc do logowania
          </Link>
        </p>
      </form>
    </main>
  );
}
