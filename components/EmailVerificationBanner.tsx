'use client';

import { isFreeBeta } from '@/lib/beta';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { MailCheck } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useFeatures } from '@/hooks/useFeatures';

// Shown inside the app until the account's email is confirmed (2026-10-02): the 7-day PRO trial
// starts only after that. Also reports the result of clicking the link in the email
// (/api/auth/verify-email redirects back with ?emailVerified=1|invalid).
export function EmailVerificationBanner() {
  const features = useFeatures();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const verifiedParam = searchParams.get('emailVerified');

  useEffect(() => {
    if (!verifiedParam) {
      return;
    }
    if (verifiedParam === '1') {
      toast.success(isFreeBeta() ? 'Adres e-mail potwierdzony - plan PRO jest aktywny na czas bety.' : 'Adres e-mail potwierdzony - 7 dni planu PRO jest aktywne.');
    } else {
      toast.error('Link potwierdzający jest nieprawidłowy lub wygasł. Wyślij nowy z baneru w aplikacji.');
    }
    router.replace(pathname);
  }, [verifiedParam, pathname, router]);

  if (!features || features.emailVerified || verifiedParam === '1') {
    return null;
  }

  const resend = async () => {
    setIsSending(true);
    try {
      await apiClient.post('/auth/resend-verification');
      setSent(true);
      toast.success('Wysłaliśmy nowy link potwierdzający.');
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        toast.error('Za często - spróbuj ponownie za godzinę.');
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      role="status"
      className="mx-4 mt-4 sm:mx-6 flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        Potwierdź adres e-mail (link jest w skrzynce), żeby odblokować {isFreeBeta() ? 'darmowy plan PRO na czas bety' : '7 dni pełnego planu PRO'}.
      </p>
      <button
        type="button"
        onClick={resend}
        disabled={isSending || sent}
        className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium disabled:opacity-60"
      >
        {sent ? 'Wysłano' : isSending ? 'Wysyłanie...' : 'Wyślij ponownie'}
      </button>
    </div>
  );
}
