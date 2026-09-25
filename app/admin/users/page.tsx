'use client';

// Admin: customer accounts (2026-09-25) - create an account for a customer (e.g. a real-estate
// agency) with an emailed "set your password" link, or re-send the invite if it expired.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api-client';

type AdminUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  hasPassword: boolean;
  socialAccountCount: number;
};

type InviteResponse = {
  status: 'created' | 'reinvited';
  emailSent: boolean;
  setPasswordUrl: string | null;
};

export default function AdminUsersPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [manualLink, setManualLink] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const loadUsers = async () => {
    try {
      const response = await apiClient.get<{ users: AdminUser[] }>('/admin/users');
      setUsers(response.data.users);
    } catch {
      toast.error('Brak dostępu albo błąd serwera.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      void loadUsers();
    }
  }, [isAuthenticated]);

  const invite = async (inviteEmail: string, inviteName: string) => {
    try {
      setIsSubmitting(true);
      setManualLink(null);
      const response = await apiClient.post<InviteResponse>('/admin/users', { email: inviteEmail, name: inviteName });
      const { status, emailSent, setPasswordUrl } = response.data;
      if (emailSent) {
        toast.success(status === 'created' ? 'Konto utworzone, zaproszenie wysłane.' : 'Zaproszenie wysłane ponownie.');
      } else {
        toast.warning('Konto gotowe, ale e-mail nie wyszedł - przekaż link ręcznie.');
        setManualLink(setPasswordUrl);
      }
      setEmail('');
      setName('');
      await loadUsers();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(message ?? 'Nie udało się utworzyć konta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Ładowanie sesji...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Admin: konta klientów</h2>
        <Link href="/admin/jobs" className="text-sm text-primary hover:underline">
          Statusy jobów →
        </Link>
      </div>

      <section className="bg-card border border-border rounded-xl p-6 space-y-3">
        <h3 className="font-medium text-foreground">Utwórz konto</h3>
        <p className="text-sm text-muted-foreground">
          Klient dostanie e-mail z linkiem do ustawienia hasła (ważny 72 h). Nie znasz jego hasła - klient ustawia je sam.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="E-mail, np. biuro@firma.pl"
            className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
          />
          <input
            value={name}
            onChange={(event) => setName(event.target.value.slice(0, 100))}
            placeholder="Nazwa, np. PRYZMAT Nieruchomości"
            className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
          />
        </div>
        <button
          type="button"
          onClick={() => invite(email, name)}
          disabled={isSubmitting || !email.trim() || !name.trim()}
          className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-secondary/40 transition-colors text-sm font-medium disabled:opacity-50"
        >
          {isSubmitting ? 'Tworzenie...' : 'Utwórz konto i wyślij zaproszenie'}
        </button>
        {manualLink && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 space-y-1">
            <p className="text-sm text-foreground">E-mail nie wyszedł. Przekaż klientowi ten link (ważny 72 h):</p>
            <code className="block break-all text-xs">{manualLink}</code>
          </div>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-6 space-y-3">
        <h3 className="font-medium text-foreground">Konta</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Ładowanie...</p>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((user) => (
              <li key={user.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-foreground">
                    {user.name} <span className="text-muted-foreground font-normal">· {user.email}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    od {new Date(user.createdAt).toLocaleDateString('pl-PL')} · konta social: {user.socialAccountCount} ·{' '}
                    {user.hasPassword ? 'aktywne' : 'czeka na ustawienie hasła'}
                  </p>
                </div>
                {!user.hasPassword && (
                  <button
                    type="button"
                    onClick={() => invite(user.email, user.name)}
                    disabled={isSubmitting}
                    className="text-xs text-primary hover:underline font-medium disabled:opacity-50"
                  >
                    Wyślij ponownie
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
