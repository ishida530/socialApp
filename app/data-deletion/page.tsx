import type { Metadata } from 'next';
import Link from 'next/link';

// User data deletion instructions (2026-09-25) - the "Data deletion instructions URL" required by
// Meta for apps using Facebook Login (App settings -> Basic -> User data deletion). Bilingual on
// purpose: Meta's App Review team reads the English part. Kept consistent with /privacy section 10.
export const metadata: Metadata = {
  title: 'Usuwanie danych | Postfly',
  description: 'Jak usunąć swoje dane z Postfly, w tym dane z Facebooka, Instagrama, LinkedIn, TikToka i YouTube. How to delete your data from Postfly.',
};

const CONTACT_EMAIL = 'hello@postfly.pl';

// ?code=... - the status link Meta shows after a Data Deletion Request (app/api/meta/data-deletion).
// Only a short hex code is accepted, so arbitrary text from the URL is never echoed on the page.
const CONFIRMATION_CODE_PATTERN = /^[a-f0-9]{8,64}$/;

export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const { code } = await searchParams;
  const confirmationCode = typeof code === 'string' && CONFIRMATION_CODE_PATTERN.test(code) ? code : null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {confirmationCode && (
          <div className="mb-8 rounded-lg border border-border bg-secondary/30 p-4 text-sm leading-6">
            <p className="font-semibold text-foreground">Żądanie usunięcia danych zostało zrealizowane.</p>
            <p className="text-muted-foreground">
              Dane Twoich stron Facebook i kont Instagram połączonych z Postfly zostały usunięte. Kod potwierdzenia:{' '}
              <code className="text-foreground">{confirmationCode}</code>
            </p>
            <p className="mt-2 font-semibold text-foreground">Your data deletion request has been completed.</p>
            <p className="text-muted-foreground">
              The data of your Facebook Pages and Instagram accounts connected to Postfly has been deleted. Confirmation
              code: <code className="text-foreground">{confirmationCode}</code>
            </p>
          </div>
        )}

        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-border bg-secondary/30 text-sm text-foreground hover:bg-secondary/50"
          >
            ← Powrót do Pulpitu
          </Link>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight">Usuwanie danych z Postfly</h1>
        <p className="mt-2 text-sm text-muted-foreground">Data ostatniej aktualizacji: 3 października 2026 r.</p>

        <section className="mt-8 space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Postfly przechowuje dane kont społecznościowych, które połączysz (Facebook, Instagram, LinkedIn, TikTok,
            YouTube): identyfikator strony, konta lub kanału, jego nazwę, tokeny dostępu potrzebne do publikacji, statystyki
            konta i opublikowanych przez Postfly postów, a przy obsłudze komentarzy - treść komentarzy i nazwę ich autorów.
            Możesz je usunąć w każdej chwili jednym z poniższych sposobów.
          </p>

          <h2 className="text-base font-semibold text-foreground">1. Odłączenie jednego konta społecznościowego</h2>
          <p>
            Zaloguj się do Postfly, przejdź do listy połączonych kont i wybierz <strong className="text-foreground">Rozłącz</strong>{' '}
            przy danym koncie. Tokeny dostępu i dane tego konta (w tym statystyki i komentarze) zostaną natychmiast usunięte;
            dostęp do TikToka i YouTube odwołujemy też po stronie platformy.
          </p>

          <h2 className="text-base font-semibold text-foreground">2. Usunięcie całego konta Postfly</h2>
          <p>
            W <strong className="text-foreground">Ustawieniach konta → Usuń konto</strong> potwierdź operację hasłem (przy koncie
            zakładanym przez Google - adresem e-mail konta). Usuwamy natychmiast konto, wszystkie połączone konta społecznościowe
            z ich tokenami (dostęp do TikToka i YouTube odwołujemy u platformy), przesłane pliki multimediów oraz zaplanowane
            i szkicowe posty.
          </p>

          <h2 className="text-base font-semibold text-foreground">3. Cofnięcie dostępu po stronie Facebooka</h2>
          <p>
            Na Facebooku wejdź w <strong className="text-foreground">Ustawienia i prywatność → Ustawienia → Aplikacje i
            witryny</strong> (albo <strong className="text-foreground">Integracje biznesowe</strong>), znajdź Postfly i wybierz{' '}
            <strong className="text-foreground">Usuń</strong>. Postfly traci wtedy dostęp do Twoich stron i konta Instagram.
            Jeśli przy usuwaniu poprosisz o usunięcie danych, Facebook przekaże nam to żądanie, a my automatycznie usuniemy
            dane połączonych stron i kont Instagram (z ich statystykami i komentarzami); potwierdzenie z kodem zobaczysz na
            Facebooku.
          </p>
          <p>
            <strong className="text-foreground">YouTube / Google:</strong> dostęp cofniesz na stronie{' '}
            <a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noopener noreferrer" className="text-foreground underline">
              https://security.google.com/settings/security/permissions
            </a>
            ; dane z YouTube usuwamy wtedy najpóźniej w ciągu 30 dni. <strong className="text-foreground">TikTok:</strong>{' '}
            w aplikacji TikTok: Ustawienia i prywatność → Bezpieczeństwo → Aplikacje i usługi → Postfly → Usuń dostęp.
            <strong className="text-foreground"> LinkedIn:</strong> Ustawienia → Prywatność danych → Uprawnione usługi.
          </p>

          <h2 className="text-base font-semibold text-foreground">4. Prośba e-mailem</h2>
          <p>
            Jeśli nie masz dostępu do konta, napisz na{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline">
              {CONTACT_EMAIL}
            </a>{' '}
            z adresu przypisanego do konta i tematem „Usunięcie danych”. Usuniemy dane w ciągu 30 dni i potwierdzimy to
            e-mailem.
          </p>
        </section>

        <hr className="my-12 border-border" />

        <h2 className="text-2xl font-semibold tracking-tight">Deleting your data from Postfly</h2>
        <section className="mt-6 space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Postfly stores data of the social accounts you connect (e.g. Facebook, Instagram, LinkedIn): the page or account
            ID, its name, the access tokens needed to publish, account and post statistics and, if you use comment replies,
            comment texts and their authors' names. This covers Facebook, Instagram, LinkedIn, TikTok and YouTube. You can delete
            it at any time:
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Disconnect one social account:</strong> log in to Postfly, open your
              connected accounts and choose <em>Rozłącz</em> (Disconnect). Its access tokens and data are deleted immediately;
              TikTok and YouTube access is also revoked on the platform side.
            </li>
            <li>
              <strong className="text-foreground">Delete your whole Postfly account:</strong> Account settings → Delete
              account, confirmed with your password (or your account email for accounts created with Google). The account, all
              connected social accounts with their tokens (TikTok and YouTube grants are revoked), uploaded media files, and
              scheduled and draft posts are deleted immediately.
            </li>
            <li>
              <strong className="text-foreground">Revoke access on Facebook:</strong> Settings &amp; privacy → Settings →
              Apps and websites (or Business integrations) → Postfly → Remove. If you also request data deletion there,
              Facebook forwards the request to us and the data of your connected Pages and Instagram accounts (including
              their statistics and comments) is deleted automatically; Facebook shows you a confirmation code.
            </li>
            <li>
              <strong className="text-foreground">Revoke access on Google / YouTube:</strong>{' '}
              <a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noopener noreferrer" className="text-foreground underline">
                https://security.google.com/settings/security/permissions
              </a>{' '}
              (YouTube data is deleted within 30 days). TikTok: Settings and privacy → Security → Apps and services → Postfly →
              Remove access.
            </li>
            <li>
              <strong className="text-foreground">By email:</strong> write to{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline">
                {CONTACT_EMAIL}
              </a>{' '}
              from the address linked to your account with the subject &quot;Data deletion&quot;. We delete the data within
              30 days and confirm by email.
            </li>
          </ol>
        </section>
      </div>
    </main>
  );
}
