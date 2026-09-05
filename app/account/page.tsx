'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api-client';

const CONFIRM_PHRASE = 'usuń moje konto';

export default function AccountPage() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const canDelete = password.length > 0 && confirmText.trim().toLowerCase() === CONFIRM_PHRASE;

  const handleDelete = async () => {
    if (!canDelete || isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      await apiClient.delete('/account', { data: { password } });
      toast.success('Konto zostało usunięte.');
      logout();
      router.replace('/login');
    } catch (error: unknown) {
      // A 400 (e.g. wrong password) is already surfaced by the apiClient response
      // interceptor's generic 400 handling — avoid a second, duplicate toast here.
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status !== 400) {
        toast.error('Nie udało się usunąć konta. Spróbuj ponownie.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Ładowanie...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6 space-y-6">
      <section className="bg-card border border-border rounded-xl p-6 space-y-2 max-w-2xl">
        <h2 className="text-lg font-semibold text-foreground">Ustawienia konta</h2>
        <p className="text-sm text-muted-foreground">Zalogowano jako {user?.email}.</p>
      </section>

      <section className="bg-card border border-destructive/40 rounded-xl p-6 space-y-4 max-w-2xl">
        <div>
          <h2 className="text-lg font-semibold text-destructive">Usuń konto</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Ta akcja jest nieodwracalna. Usunięte zostaną trwale: Twoje konto, połączone konta social media
            (wraz z tokenami dostępu), przesłane media, zaplanowane i zrealizowane zadania publikacji oraz dane
            subskrypcji. Jeśli masz aktywną płatną subskrypcję, zostanie ona anulowana.
          </p>
        </div>

        {!showConfirm ? (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="px-4 py-2 rounded-lg border border-destructive text-destructive hover:bg-destructive/10 transition-colors text-sm font-medium"
          >
            Chcę usunąć konto
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Hasło</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
                placeholder="Podaj hasło, aby potwierdzić"
              />
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Wpisz <span className="font-mono text-foreground">{CONFIRM_PHRASE}</span>, aby potwierdzić
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
                placeholder={CONFIRM_PHRASE}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  setPassword('');
                  setConfirmText('');
                }}
                className="px-4 py-2 rounded-lg border border-border text-foreground text-sm"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canDelete || isSubmitting}
                className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50"
              >
                {isSubmitting ? 'Usuwanie...' : 'Usuń konto trwale'}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
