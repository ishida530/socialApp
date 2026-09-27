import type { Metadata } from 'next';
import Link from 'next/link';

// User data deletion instructions (2026-09-25) - the "Data deletion instructions URL" required by
// Meta for apps using Facebook Login (App settings -> Basic -> User data deletion). Bilingual on
// purpose: Meta's App Review team reads the English part. Kept consistent with /privacy section 10.
export const metadata: Metadata = {
  title: 'Usuwanie danych | Postfly',
  description: 'Jak usunąć swoje dane z Postfly, w tym dane z Facebooka i Instagrama. How to delete your data from Postfly.',
};

const CONTACT_EMAIL = 'pawel.sawczuk.email@gmail.com';

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-border bg-secondary/30 text-sm text-foreground hover:bg-secondary/50"
          >
            ← Powrót do Pulpitu
          </Link>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight">Usuwanie danych z Postfly</h1>
        <p className="mt-2 text-sm text-muted-foreground">Data ostatniej aktualizacji: 25 września 2026 r.</p>

        <section className="mt-8 space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Postfly przechowuje dane kont społecznościowych (np. Facebook, Instagram, LinkedIn), które połączysz: identyfikator
            strony lub konta, jego nazwę oraz tokeny dostępu potrzebne do publikacji. Możesz je usunąć w każdej chwili
            jednym z poniższych sposobów.
          </p>

          <h2 className="text-base font-semibold text-foreground">1. Odłączenie jednego konta społecznościowego</h2>
          <p>
            Zaloguj się do Postfly, przejdź do listy połączonych kont i wybierz <strong className="text-foreground">Rozłącz</strong>{' '}
            przy danym koncie. Tokeny dostępu i dane tego konta zostaną natychmiast usunięte.
          </p>

          <h2 className="text-base font-semibold text-foreground">2. Usunięcie całego konta Postfly</h2>
          <p>
            W <strong className="text-foreground">Ustawieniach konta → Usuń konto</strong> potwierdź operację hasłem. Usuwamy
            natychmiast konto, wszystkie połączone konta społecznościowe z ich tokenami oraz zaplanowane i szkicowe posty.
            Pliki multimediów pozostałe w magazynie usuwamy na prośbę e-mailem (sposób 4).
          </p>

          <h2 className="text-base font-semibold text-foreground">3. Cofnięcie dostępu po stronie Facebooka</h2>
          <p>
            Na Facebooku wejdź w <strong className="text-foreground">Ustawienia i prywatność → Ustawienia → Aplikacje i
            witryny</strong>, znajdź Postfly i wybierz <strong className="text-foreground">Usuń</strong>. Postfly traci wtedy
            dostęp do Twoich stron i konta Instagram; dane zapisane w Postfly usuniesz sposobem 1 lub 2.
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
            ID, its name and the access tokens needed to publish. You can delete it at any time:
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Disconnect one social account:</strong> log in to Postfly, open your
              connected accounts and choose <em>Rozłącz</em> (Disconnect). Its access tokens and data are deleted immediately.
            </li>
            <li>
              <strong className="text-foreground">Delete your whole Postfly account:</strong> Account settings → Delete
              account, confirmed with your password. The account, all connected social accounts with their tokens, and scheduled
              and draft posts are deleted immediately; remaining media files in storage are deleted on request by email.
            </li>
            <li>
              <strong className="text-foreground">Revoke access on Facebook:</strong> Settings &amp; privacy → Settings →
              Apps and websites → Postfly → Remove.
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
