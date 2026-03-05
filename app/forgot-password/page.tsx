"use client";

import Link from 'next/link';
import axios from 'axios';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { BrandLogo } from '@/components/BrandLogo';

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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      await apiClient.post('/auth/forgot-password', { email });
      toast.success('Jesli konto istnieje, wyslalismy wiadomosc e-mail z instrukcja resetu hasla.');
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

      toast.error('Nie udalo sie wyslac instrukcji resetu hasla. Sprobuj ponownie.');
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
        <div className="flex justify-center">
          <BrandLogo className="h-12 w-auto" priority />
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-foreground">Zapomnialem hasla</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Podaj adres e-mail, a wyslemy Ci link do ustawienia nowego hasla.
          </p>
        </div>

        <div className="space-y-2">
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

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {isSubmitting ? 'Wysylanie...' : 'Wyslij link resetu'}
        </button>

        <p className="text-sm text-muted-foreground text-center">
          Pamietasz haslo?{' '}
          <Link className="text-primary hover:underline" href="/login">
            Wroc do logowania
          </Link>
        </p>
      </form>
    </main>
  );
}
