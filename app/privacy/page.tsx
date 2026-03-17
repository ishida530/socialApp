import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Polityka Prywatności | Postfly',
  description: 'Polityka prywatności i zasady przetwarzania danych osobowych w Postfly.',
};

export default function PrivacyPage() {
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

        <h1 className="text-3xl font-semibold tracking-tight">Polityka prywatności Postfly</h1>
        <p className="mt-6 text-sm text-muted-foreground">
          Niniejsza Polityka Prywatności opisuje zasady przetwarzania danych w ramach serwisu Postfly.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Data ostatniej aktualizacji: 17 marca 2026 r.</p>

        <section className="mt-8 space-y-4 text-sm leading-6 text-muted-foreground">
          <h2 className="text-base font-semibold text-foreground">1. Administrator danych</h2>
          <p>
            Administratorem danych osobowych jest <strong className="text-foreground">Paweł Sawczuk</strong>, 
            prowadzący działalność nierejestrowaną pod adresem: 126B, 11-010 Barczewko.
          </p>

          <h2 className="text-base font-semibold text-foreground">2. Zakres zbieranych danych</h2>
          <p>
            W związku z korzystaniem z Postfly możemy przetwarzać następujące dane:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>dane konta użytkownika (np. adres e-mail, identyfikator użytkownika),</li>
            <li>
              dane kont społecznościowych z OAuth (np. TikTok/YouTube user ID, username, tokeny dostępowe
              i odświeżające),
            </li>
            <li>
              metadane korzystania z usługi (np. limity użycia, historia zadań publikacji,
              informacje diagnostyczne i bezpieczeństwa),
            </li>
            <li>
              dane techniczne sesji (np. identyfikatory sesji, logi bezpieczeństwa, adres IP,
              user-agent).
            </li>
          </ul>

          <h2 className="text-base font-semibold text-foreground">3. Cele i podstawy prawne przetwarzania (RODO)</h2>
          <p>Dane przetwarzamy w następujących celach:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              świadczenie usługi i realizacja umowy (art. 6 ust. 1 lit. b RODO),
            </li>
            <li>
              obsługa płatności i subskrypcji (art. 6 ust. 1 lit. b RODO),
            </li>
            <li>
              bezpieczeństwo, zapobieganie nadużyciom i utrzymanie stabilności systemu (art. 6 ust.
              1 lit. f RODO – prawnie uzasadniony interes administratora),
            </li>
            <li>
              realizacja obowiązków prawnych, w tym prowadzenie uproszczonej ewidencji sprzedaży (art. 6 ust. 1 lit.
              c RODO).
            </li>
          </ul>

          <h2 className="text-base font-semibold text-foreground">4. Płatności i Stripe</h2>
          <p>
            Płatności realizuje Stripe jako odrębny dostawca usług płatniczych. Postfly nie
            przechowuje pełnych danych kart płatniczych. Przechowujemy informacje o statusie
            subskrypcji i identyfikatorach powiązanych z rozliczeniami w celach weryfikacji dostępu i realizacji usług.
          </p>

          <h2 className="text-base font-semibold text-foreground">5. Odbiorcy danych i podmioty przetwarzające</h2>
          <p>Dane mogą być powierzane zaufanym dostawcom infrastruktury i usług:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Stripe – obsługa płatności,</li>
            <li>Vercel – hosting i infrastruktura aplikacji,</li>
            <li>Supabase (PostgreSQL) – bezpieczne przechowywanie danych aplikacji,</li>
            <li>TikTok / YouTube (oraz inne platformy) – publikacja i autoryzacja OAuth.</li>
          </ul>

          <h2 className="text-base font-semibold text-foreground">6. Cookies i sesje</h2>
          <p>
            Używamy niezbędnych plików cookie w celu umożliwienia logowania, utrzymania sesji, zapewnienia bezpieczeństwa 
            oraz prawidłowego działania podstawowych funkcji serwisu.
          </p>

          <h2 className="text-base font-semibold text-foreground">7. Okres przechowywania danych</h2>
          <p>
            Dane przechowujemy przez okres niezbędny do świadczenia usługi oraz przez czas wymagany przepisami prawa 
            (np. dla celów prowadzenia uproszczonej ewidencji sprzedaży). Dane OAuth i dane konta są usuwane 
            niezwłocznie po żądaniu usunięcia konta przez użytkownika, o ile prawo nie nakazuje ich dalszego archiwizowania.
          </p>

          <h2 className="text-base font-semibold text-foreground">8. Prawa osób, których dane dotyczą</h2>
          <p>
            Zgodnie z RODO przysługuje Ci prawo do: dostępu do swoich danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, 
            przenoszenia danych, wniesienia sprzeciwu oraz wniesienia skargi do organu nadzorczego (Prezesa UODO).
          </p>

          <h2 className="text-base font-semibold text-foreground">9. Usunięcie konta i tokenów OAuth</h2>
          <p>
            Użytkownik może w każdej chwili zażądać usunięcia konta w ustawieniach aplikacji lub kontaktując się z administratorem. 
            Skutkuje to wygaśnięciem uprawnień i usunięciem powiązanych tokenów platform zewnętrznych.
          </p>

          <h2 className="text-base font-semibold text-foreground">10. Bezpieczeństwo danych</h2>
          <p>
            Stosujemy środki techniczne adekwatne do zagrożeń, w tym szyfrowanie SSL, bezpieczne 
            przechowywanie tokenów (encryption at rest) oraz rygorystyczną kontrolę dostępu do bazy danych.
          </p>

          <h2 className="text-base font-semibold text-foreground">11. Transfer danych poza EOG</h2>
          <p>
            W związku z wykorzystaniem globalnych dostawców (Stripe, Vercel, Supabase), dane mogą być przekazywane 
            poza Europejski Obszar Gospodarczy na podstawie standardowych klauzul umownych zapewniających ochronę danych.
          </p>

          <h2 className="text-base font-semibold text-foreground">12. Kontakt</h2>
          <p>
            W sprawach dotyczących prywatności możesz skontaktować się bezpośrednio z Administratorem: 
            <strong className="text-foreground"> Paweł Sawczuk</strong>, e-mail: <strong className="text-foreground">pawel.sawczuk.email@gmail.com</strong>.
          </p>

          <h2 className="text-base font-semibold text-foreground">13. Zmiany polityki prywatności</h2>
          <p>
            Niniejsza polityka może być aktualizowana. Aktualna wersja jest zawsze dostępna pod tym adresem, 
            a data ostatniej modyfikacji widnieje na początku dokumentu.
          </p>
        </section>
      </div>
    </main>
  );
}