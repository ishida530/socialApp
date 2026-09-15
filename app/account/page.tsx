'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api-client';
import { CollapsibleSection } from '@/components/CollapsibleSection';

// EPIC 10 TASK-10.2 (2026-09-15): single-open accordion state for the 5 sections below - opening
// one collapses the others, so this screen asks one decision at a time instead of showing all 5
// (Telegram, profil, autopilot, 2FA, usuń konto) expanded at once (the "1 screen = 1 decision"
// principle from docs/postfly-plan-projektu.md section 0.1, flagged as violated in docs/UX_AUDIT.md).
type AccountSection = 'telegram' | 'profile' | 'autopilot' | 'twoFactor' | 'delete';

function StatusBadge({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel?: string }) {
  if (!on && !offLabel) {
    return null;
  }
  return (
    <span className={`text-xs font-medium ${on ? 'text-emerald-500' : 'text-muted-foreground'}`}>
      {on ? onLabel : offLabel}
    </span>
  );
}

const CONFIRM_PHRASE = 'usuń moje konto';

type TelegramLinkCodeResponse = {
  code: string;
  expiresAt: string;
  botUsername: string | null;
};

export default function AccountPage() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null);
  const [telegramLinkCode, setTelegramLinkCode] = useState<TelegramLinkCodeResponse | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  const [businessDescription, setBusinessDescription] = useState('');
  const [isSavingBusinessDescription, setIsSavingBusinessDescription] = useState(false);
  const BUSINESS_DESCRIPTION_MAX_LENGTH = 500;

  // Web equivalent of the Telegram /autopilot on|off|status command - same User.autopilotEnabled
  // field, so toggling here has the exact same effect as typing the command in the bot.
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [isTogglingAutopilot, setIsTogglingAutopilot] = useState(false);

  // EPIC 9 TASK-9.3 (2FA, 2026-09-15).
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [twoFactorQrCodeDataUrl, setTwoFactorQrCodeDataUrl] = useState<string | null>(null);
  const [twoFactorEnableCode, setTwoFactorEnableCode] = useState('');
  const [isStartingTwoFactorSetup, setIsStartingTwoFactorSetup] = useState(false);
  const [isEnablingTwoFactor, setIsEnablingTwoFactor] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null);
  const [showDisableTwoFactor, setShowDisableTwoFactor] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [isDisablingTwoFactor, setIsDisablingTwoFactor] = useState(false);

  const [openSection, setOpenSection] = useState<AccountSection | null>(null);
  const toggleSection = (section: AccountSection) => (open: boolean) => setOpenSection(open ? section : null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    apiClient
      .get<{ linked: boolean }>('/telegram/link-code')
      .then((response) => setTelegramLinked(response.data.linked))
      .catch(() => setTelegramLinked(null));
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    apiClient
      .get<{ businessDescription: string | null; autopilotEnabled: boolean; twoFactorEnabled: boolean }>('/auth/me')
      .then((response) => {
        setBusinessDescription(response.data.businessDescription ?? '');
        setAutopilotEnabled(response.data.autopilotEnabled ?? false);
        setTwoFactorEnabled(response.data.twoFactorEnabled ?? false);
      })
      .catch(() => {});
  }, [isAuthenticated]);

  // Renders the otpauth:// URI as a scannable QR code - generated entirely client-side (the
  // `qrcode` package does no network calls), never sent to any third-party QR-image service.
  // The URI embeds the raw TOTP secret, so routing it through an external API would leak it.
  useEffect(() => {
    if (!twoFactorSetup) {
      setTwoFactorQrCodeDataUrl(null);
      return;
    }

    let cancelled = false;
    QRCode.toDataURL(twoFactorSetup.otpauthUrl, { width: 220, margin: 1 })
      .then((dataUrl) => {
        if (!cancelled) {
          setTwoFactorQrCodeDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTwoFactorQrCodeDataUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [twoFactorSetup]);

  const handleSaveBusinessDescription = async () => {
    try {
      setIsSavingBusinessDescription(true);
      await apiClient.patch('/auth/me', { businessDescription });
      toast.success('Zapisano.');
    } catch {
      toast.error('Nie udało się zapisać. Spróbuj ponownie.');
    } finally {
      setIsSavingBusinessDescription(false);
    }
  };

  const handleToggleAutopilot = async () => {
    const next = !autopilotEnabled;

    try {
      setIsTogglingAutopilot(true);
      await apiClient.patch('/auth/me', { autopilotEnabled: next });
      setAutopilotEnabled(next);
      toast.success(next ? 'Autopilot włączony.' : 'Autopilot wyłączony.');
    } catch {
      toast.error('Nie udało się zmienić ustawienia. Spróbuj ponownie.');
    } finally {
      setIsTogglingAutopilot(false);
    }
  };

  const handleStartTwoFactorSetup = async () => {
    try {
      setIsStartingTwoFactorSetup(true);
      const response = await apiClient.post<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup');
      setTwoFactorSetup(response.data);
      setNewBackupCodes(null);
    } catch {
      toast.error('Nie udało się rozpocząć konfiguracji 2FA.');
    } finally {
      setIsStartingTwoFactorSetup(false);
    }
  };

  const handleEnableTwoFactor = async () => {
    try {
      setIsEnablingTwoFactor(true);
      const response = await apiClient.post<{ backupCodes: string[] }>('/auth/2fa/enable', { code: twoFactorEnableCode });
      setTwoFactorEnabled(true);
      setTwoFactorSetup(null);
      setTwoFactorEnableCode('');
      setNewBackupCodes(response.data.backupCodes);
      setOpenSection('twoFactor');
      toast.success('2FA włączone.');
    } catch {
      toast.error('Nieprawidłowy kod. Sprawdź godzinę w telefonie i spróbuj ponownie.');
    } finally {
      setIsEnablingTwoFactor(false);
    }
  };

  const handleDownloadBackupCodes = () => {
    if (!newBackupCodes) {
      return;
    }

    const content =
      `Postfly - kody zapasowe 2FA\n` +
      `Wygenerowano: ${new Date().toLocaleString('pl-PL')}\n` +
      `Każdy kod działa tylko raz.\n\n` +
      `${newBackupCodes.join('\n')}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'postfly-kody-zapasowe.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDisableTwoFactor = async () => {
    try {
      setIsDisablingTwoFactor(true);
      await apiClient.post('/auth/2fa/disable', { password: disablePassword, code: disableCode });
      setTwoFactorEnabled(false);
      setShowDisableTwoFactor(false);
      setDisablePassword('');
      setDisableCode('');
      toast.success('2FA wyłączone.');
    } catch {
      toast.error('Nie udało się wyłączyć 2FA - sprawdź hasło i kod.');
    } finally {
      setIsDisablingTwoFactor(false);
    }
  };

  const handleGenerateTelegramCode = async () => {
    try {
      setIsGeneratingCode(true);
      const response = await apiClient.post<TelegramLinkCodeResponse>('/telegram/link-code');
      setTelegramLinkCode(response.data);
    } catch {
      toast.error('Nie udało się wygenerować kodu. Spróbuj ponownie.');
    } finally {
      setIsGeneratingCode(false);
    }
  };

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

      <CollapsibleSection
        title="Telegram"
        description="Połącz konto Telegram, żeby otrzymywać powiadomienia i zatwierdzać publikacje z telefonu."
        badge={<StatusBadge on={!!telegramLinked} onLabel="Połączono ✓" />}
        open={openSection === 'telegram'}
        onOpenChange={toggleSection('telegram')}
      >
        {!telegramLinkCode ? (
          <button
            type="button"
            onClick={handleGenerateTelegramCode}
            disabled={isGeneratingCode}
            className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-secondary/40 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {isGeneratingCode
              ? 'Generowanie...'
              : telegramLinked
                ? 'Połącz inne konto Telegram'
                : 'Wygeneruj kod'}
          </button>
        ) : (
          <div className="space-y-2 text-sm text-foreground">
            <p>
              Wyślij wiadomość{' '}
              <span className="font-mono font-semibold">/start {telegramLinkCode.code}</span> do{' '}
              {telegramLinkCode.botUsername ? (
                <span className="font-mono">@{telegramLinkCode.botUsername}</span>
              ) : (
                'bota Postfly'
              )}{' '}
              na Telegramie.
            </p>
            <p className="text-xs text-muted-foreground">
              Kod ważny do {new Date(telegramLinkCode.expiresAt).toLocaleTimeString('pl-PL')}.
            </p>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Profil konta"
        description="Opisz w 1-2 zdaniach czym zajmuje się to konto - AI dopasuje ton i styl generowanych opisów/hashtagów do tego kontekstu, zamiast pisać neutralnie."
        open={openSection === 'profile'}
        onOpenChange={toggleSection('profile')}
      >
        <div>
          <textarea
            value={businessDescription}
            onChange={(event) => setBusinessDescription(event.target.value.slice(0, BUSINESS_DESCRIPTION_MAX_LENGTH))}
            rows={3}
            maxLength={BUSINESS_DESCRIPTION_MAX_LENGTH}
            className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
            placeholder="Np. Prowadzę salon kosmetyczny w Warszawie, specjalizacja: paznokcie hybrydowe."
          />
          <p className="text-xs text-muted-foreground mt-1 text-right">
            {businessDescription.length}/{BUSINESS_DESCRIPTION_MAX_LENGTH}
          </p>
        </div>

        <button
          type="button"
          onClick={handleSaveBusinessDescription}
          disabled={isSavingBusinessDescription}
          className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-secondary/40 transition-colors text-sm font-medium disabled:opacity-50"
        >
          {isSavingBusinessDescription ? 'Zapisywanie...' : 'Zapisz'}
        </button>
      </CollapsibleSection>

      <CollapsibleSection
        title="🤖 Autopilot"
        description="Włączony: nowy materiał planuje się automatycznie bez pytania o zgodę. Wyłączony: każdy post czeka na Twoje zatwierdzenie."
        badge={<StatusBadge on={autopilotEnabled} onLabel="Włączony" offLabel="Wyłączony" />}
        open={openSection === 'autopilot'}
        onOpenChange={toggleSection('autopilot')}
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Włączony: nowy materiał wysłany na Telegram planuje się automatycznie o najlepszej porze per
            platforma, bez pytania o zgodę - poza sytuacjami wymagającymi ręcznej decyzji (np. wykryte ryzyko
            w treści albo platforma jeszcze nie gotowa). Wyłączony: każdy post czeka na Twoje zatwierdzenie,
            jak dotychczas.
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={autopilotEnabled}
            onClick={handleToggleAutopilot}
            disabled={isTogglingAutopilot}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              autopilotEnabled ? 'bg-primary' : 'bg-secondary'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autopilotEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="🔐 Weryfikacja dwuetapowa (2FA)"
        description="Dodatkowe zabezpieczenie logowania - kod z aplikacji uwierzytelniającej oprócz hasła."
        badge={<StatusBadge on={twoFactorEnabled} onLabel="Włączone ✓" />}
        open={openSection === 'twoFactor'}
        onOpenChange={toggleSection('twoFactor')}
      >
        {newBackupCodes && (
          <div className="bg-secondary/30 border border-primary/40 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">
              Zapisz te kody zapasowe w bezpiecznym miejscu - każdy działa tylko raz i pozwoli Ci się
              zalogować, jeśli stracisz dostęp do aplikacji uwierzytelniającej. Nie pokażemy ich ponownie.
            </p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm text-foreground">
              {newBackupCodes.map((code) => (
                <span key={code} className="bg-background border border-border rounded px-2 py-1 text-center">
                  {code}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleDownloadBackupCodes}
                className="text-xs text-primary hover:underline font-medium"
              >
                Pobierz jako plik
              </button>
              <button
                type="button"
                onClick={() => setNewBackupCodes(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Zapisałem kody, ukryj
              </button>
            </div>
          </div>
        )}

        {twoFactorEnabled ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-500 font-medium">Włączone ✓</p>

            {!showDisableTwoFactor ? (
              <button
                type="button"
                onClick={() => setShowDisableTwoFactor(true)}
                className="px-4 py-2 rounded-lg border border-destructive text-destructive hover:bg-destructive/10 transition-colors text-sm font-medium"
              >
                Wyłącz 2FA
              </button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Hasło</label>
                  <input
                    type="password"
                    value={disablePassword}
                    onChange={(event) => setDisablePassword(event.target.value)}
                    className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Kod z aplikacji uwierzytelniającej</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={disableCode}
                    onChange={(event) => setDisableCode(event.target.value)}
                    className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
                    placeholder="123456"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDisableTwoFactor(false)}
                    className="px-4 py-2 rounded-lg border border-border text-foreground text-sm"
                  >
                    Anuluj
                  </button>
                  <button
                    type="button"
                    onClick={handleDisableTwoFactor}
                    disabled={isDisablingTwoFactor || !disablePassword || !disableCode}
                    className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50"
                  >
                    {isDisablingTwoFactor ? 'Wyłączanie...' : 'Wyłącz 2FA'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : !twoFactorSetup ? (
          <button
            type="button"
            onClick={handleStartTwoFactorSetup}
            disabled={isStartingTwoFactorSetup}
            className="px-4 py-2 rounded-lg border border-border text-foreground hover:bg-secondary/40 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {isStartingTwoFactorSetup ? 'Generowanie...' : 'Włącz 2FA'}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Dodaj to konto w aplikacji uwierzytelniającej - zeskanuj kod QR poniżej (albo wpisz klucz ręcznie,
              jeśli nie masz jak skanować), potem potwierdź kodem.
            </p>
            {twoFactorQrCodeDataUrl && (
              <div className="flex justify-center bg-white rounded-lg p-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived, per-session data: URI, not a static asset next/image can optimize */}
                <img
                  src={twoFactorQrCodeDataUrl}
                  alt="Kod QR do zeskanowania w aplikacji uwierzytelniającej"
                  width={220}
                  height={220}
                />
              </div>
            )}
            <div className="bg-secondary/30 border border-border rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground">Nie możesz zeskanować? Wpisz klucz ręcznie:</p>
              <p className="font-mono text-sm text-foreground break-all">{twoFactorSetup.secret}</p>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Kod z aplikacji</label>
              <input
                type="text"
                inputMode="numeric"
                value={twoFactorEnableCode}
                onChange={(event) => setTwoFactorEnableCode(event.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
                placeholder="123456"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTwoFactorSetup(null)}
                className="px-4 py-2 rounded-lg border border-border text-foreground text-sm"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleEnableTwoFactor}
                disabled={isEnablingTwoFactor || !twoFactorEnableCode}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                {isEnablingTwoFactor ? 'Weryfikacja...' : 'Potwierdź i włącz'}
              </button>
            </div>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Usuń konto"
        description="Ta akcja jest nieodwracalna. Usunięte zostaną trwale: konto, połączone konta social media, przesłane media, zadania publikacji oraz dane subskrypcji."
        open={openSection === 'delete'}
        onOpenChange={toggleSection('delete')}
        variant="destructive"
      >
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
      </CollapsibleSection>
    </main>
  );
}
