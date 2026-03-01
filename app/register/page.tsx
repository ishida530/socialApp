"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      await register({ name, email, password });
      toast.success('Konto utworzone.');
      router.replace('/');
    } catch {
      toast.error('Rejestracja nie powiodła się.');
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
          <h1 className="text-2xl font-semibold text-foreground">Rejestracja</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Utwórz konto i zacznij publikować
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-foreground">Imię i nazwisko</label>
          <input
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
            placeholder="jan@flowstate.app"
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
