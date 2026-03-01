"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      await login({ email, password });
      toast.success('Zalogowano pomyślnie.');
      router.replace('/');
    } catch {
      toast.error('Logowanie nie powiodło się. Sprawdź dane.');
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
          <h1 className="text-2xl font-semibold text-foreground">Logowanie</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Zaloguj się do panelu FlowState
          </p>
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
            required
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {isSubmitting ? 'Logowanie...' : 'Zaloguj'}
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
