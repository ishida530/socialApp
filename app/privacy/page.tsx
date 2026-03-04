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
          Niniejsza Polityka Prywatności opisuje zasady przetwarzania danych w usłudze Postfly.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Data wejścia w życie: 2 marca 2026 r.</p>

        <section className="mt-8 space-y-4 text-sm leading-6 text-muted-foreground">
          <h2 className="text-base font-semibold text-foreground">1. Administrator danych</h2>
          <p>
            Administratorem danych osobowych jest <strong className="text-foreground">Code94
            Paweł Sawczuk</strong>, adres: 126B, 11-010 Barczewko, NIP: 7394015517, REGON:
            541491536.
          </p>

          <h2 className="text-base font-semibold text-foreground">2. Zakres zbieranych danych</h2>
          <p>
            W związku z korzystaniem z Postfly możemy przetwarzać następujące dane:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>dane konta użytkownika (np. adres e-mail, identyfikator użytkownika),</li>
            <li>
              dane kont społecznościowych z OAuth (np. TikTok user ID, username, tokeny dostępowe
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
              świadczenie usługi i realizacja umowy (art. 6 ust. 1 lit. b RODO), w tym planowanie i
              publikacja materiałów,
            </li>
            <li>
              obsługa płatności i subskrypcji (art. 6 ust. 1 lit. b oraz lit. c RODO),
            </li>
            <li>
              bezpieczeństwo, zapobieganie nadużyciom i utrzymanie stabilności systemu (art. 6 ust.
              1 lit. f RODO),
            </li>
            <li>
              realizacja obowiązków prawnych, w tym podatkowych i rachunkowych (art. 6 ust. 1 lit.
              c RODO).
            </li>
          </ul>

          <h2 className="text-base font-semibold text-foreground">4. Płatności i Stripe</h2>
          <p>
            Płatności realizuje Stripe jako odrębny dostawca usług płatniczych. Postfly nie
            przechowuje pełnych danych kart płatniczych. Przechowujemy informacje o statusie
            subskrypcji i identyfikatorach powiązanych z rozliczeniami.
          </p>

          <h2 className="text-base font-semibold text-foreground">5. Odbiorcy danych i podmioty przetwarzające</h2>
          <p>Dane mogą być powierzane zaufanym dostawcom infrastruktury i usług:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Stripe – obsługa płatności i subskrypcji,</li>
            <li>Vercel – hosting i infrastruktura aplikacji,</li>
            <li>Supabase (PostgreSQL) – przechowywanie danych aplikacji,</li>
            <li>TikTok (oraz inne podłączone platformy) – publikacja i autoryzacja OAuth.</li>
          </ul>

          <h2 className="text-base font-semibold text-foreground">6. Cookies i sesje</h2>
          <p>
            Używamy plików cookie i podobnych technologii w zakresie niezbędnym do działania
            logowania, utrzymania sesji, bezpieczeństwa konta oraz poprawnego działania aplikacji.
          </p>

          <h2 className="text-base font-semibold text-foreground">7. Okres przechowywania danych</h2>
          <p>
            Dane przechowujemy przez okres niezbędny do świadczenia usługi, realizacji obowiązków
            prawnych i rozpatrywania ewentualnych roszczeń. Dane OAuth i dane konta są usuwane lub
            anonimizowane po usunięciu konta, z uwzględnieniem obowiązków prawnych.
          </p>

          <h2 className="text-base font-semibold text-foreground">8. Prawa osób, których dane dotyczą</h2>
          <p>Przysługuje Ci prawo do:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>dostępu do danych i otrzymania ich kopii,</li>
            <li>sprostowania danych,</li>
            <li>usunięcia danych („prawo do bycia zapomnianym”),</li>
            <li>ograniczenia przetwarzania,</li>
            <li>przenoszenia danych,</li>
            <li>wniesienia sprzeciwu wobec przetwarzania opartego na uzasadnionym interesie,</li>
            <li>wniesienia skargi do Prezesa UODO.</li>
          </ul>

          <h2 className="text-base font-semibold text-foreground">9. Usunięcie konta i tokenów OAuth</h2>
          <p>
            Użytkownik może żądać usunięcia konta oraz powiązanych tokenów TikTok/YouTube.
            Usunięcie konta skutkuje zaprzestaniem dalszego przetwarzania danych do celów
            świadczenia usługi, z zastrzeżeniem danych wymaganych przez przepisy prawa.
          </p>

          <h2 className="text-base font-semibold text-foreground">10. Bezpieczeństwo danych</h2>
          <p>
            Stosujemy środki techniczne i organizacyjne adekwatne do ryzyka, obejmujące m.in.
            kontrolę dostępu, ochronę sesji, szyfrowanie wrażliwych danych aplikacyjnych oraz
            monitorowanie zdarzeń bezpieczeństwa.
          </p>

          <h2 className="text-base font-semibold text-foreground">11. Transfer danych poza EOG</h2>
          <p>
            W związku z korzystaniem z globalnych dostawców technologii niektóre dane mogą być
            przekazywane poza Europejski Obszar Gospodarczy zgodnie z obowiązującymi podstawami
            prawnymi (np. standardowe klauzule umowne).
          </p>

          <h2 className="text-base font-semibold text-foreground">12. Kontakt</h2>
          <p>
            W sprawach dotyczących prywatności i realizacji praw RODO możesz skontaktować się z
            Administratorem: Code94 Paweł Sawczuk, 126B, 11-010 Barczewko, NIP 7394015517, REGON
            541491536, e-mail: pawel.sawczuk.email@gmail.com.
          </p>

          <h2 className="text-base font-semibold text-foreground">13. Zmiany polityki prywatności</h2>
          <p>
            Polityka prywatności może być aktualizowana, w szczególności przy zmianach prawnych,
            technologicznych lub funkcjonalnych aplikacji. Aktualna wersja jest zawsze dostępna na
            tej stronie.
          </p>
        </section>
      </div>
    </main>
  );
}
