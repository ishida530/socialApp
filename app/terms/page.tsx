import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Regulamin | Postfly',
  description: 'Regulamin świadczenia usług drogą elektroniczną dla Postfly.',
};

export default function TermsPage() {
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

        <h1 className="text-3xl font-semibold tracking-tight">Regulamin usługi Postfly</h1>
        <p className="mt-6 text-sm text-muted-foreground">
          Niniejszy Regulamin określa zasady korzystania z aplikacji Postfly.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Data ostatniej aktualizacji: 17 marca 2026 r.</p>

        <section className="mt-8 space-y-4 text-sm leading-6 text-muted-foreground">
          <h2 className="text-base font-semibold text-foreground">1. Postanowienia ogólne</h2>
          <p>
            Niniejszy Regulamin określa zasady korzystania z aplikacji SaaS „Postfly”, służącej
            do planowania i publikacji materiałów wideo w serwisach społecznościowych (m.in.
            TikTok, YouTube) z wykorzystaniem oficjalnych integracji API i mechanizmów OAuth.
          </p>
          <p>
            Usługodawcą jest: <strong className="text-foreground">Paweł Sawczuk</strong>,
            prowadzący działalność nierejestrowaną pod adresem: 126B, 11-010 Barczewko.
          </p>

          <h2 className="text-base font-semibold text-foreground">2. Definicje</h2>
          <p>
            <strong>Użytkownik</strong> – osoba fizyczna, osoba prawna lub jednostka organizacyjna korzystająca z Postfly. 
            <strong> Konto</strong> – indywidualny profil Użytkownika w aplikacji. 
            <strong> Usługa</strong> – dostęp do funkcjonalności Postfly (planowanie i publikacja treści).
          </p>

          <h2 className="text-base font-semibold text-foreground">3. Warunki korzystania</h2>
          <p>
            Z usługi może korzystać osoba pełnoletnia, posiadająca pełną zdolność do czynności prawnych. 
            Użytkownik zobowiązuje się do korzystania z serwisu w sposób zgodny z prawem, dobrymi obyczajami 
            oraz regulaminami platform zewnętrznych (TikTok, Google/YouTube), które integruje z Postfly.
          </p>

          <h2 className="text-base font-semibold text-foreground">4. Integracje OAuth i API</h2>
          <p>
            Postfly łączy się z kontami społecznościowymi wyłącznie za zgodą Użytkownika poprzez protokół OAuth. 
            Aplikacja nie gromadzi haseł do serwisów zewnętrznych. Użytkownik może w każdej chwili cofnąć 
            uprawnienia dla Postfly bezpośrednio w ustawieniach swojego konta TikTok lub Google.
          </p>

          <h2 className="text-base font-semibold text-foreground">5. Treści i odpowiedzialność</h2>
          <p>
            Użytkownik ponosi wyłączną odpowiedzialność za materiały wideo, opisy oraz inne treści publikowane 
            za pośrednictwem Postfly. Zabrania się przesyłania treści naruszających prawo, prawa autorskie osób 
            trzecich lub promujących przemoc i nienawiść.
          </p>

          <h2 className="text-base font-semibold text-foreground">6. Płatności i subskrypcje</h2>
          <p>
            Korzystanie z wybranych funkcjonalności Postfly wymaga opłacenia subskrypcji. 
            Płatności są procesowane przez zewnętrznego operatora – <strong className="text-foreground">Stripe</strong>. 
            Subskrypcja odnawia się automatycznie, chyba że Użytkownik zrezygnuje z niej przed rozpoczęciem 
            kolejnego okresu rozliczeniowego poprzez panel zarządzania płatnościami w aplikacji.
          </p>

          <h2 className="text-base font-semibold text-foreground">7. Odstąpienie od umowy i zwroty</h2>
          <p>
            Użytkownik będący konsumentem ma prawo odstąpić od umowy w terminie 14 dni bez podania przyczyny, 
            chyba że wyraził zgodę na rozpoczęcie świadczenia usługi (dostarczenie treści cyfrowych) przed 
            upływem tego terminu, co skutkuje utratą prawa do odstąpienia. W Postfly dostęp do płatnych 
            funkcji jest przyznawany natychmiast po transakcji.
          </p>

          <h2 className="text-base font-semibold text-foreground">8. Ograniczenie odpowiedzialności</h2>
          <p>
            Usługodawca nie odpowiada za blokady kont społecznościowych, ograniczenia zasięgów lub usunięcie treści 
            przez platformy takie jak TikTok czy YouTube. Usługodawca nie gwarantuje, że API podmiotów trzecich 
            będzie dostępne bez przerw i zmian funkcjonalnych.
          </p>

          <h2 className="text-base font-semibold text-foreground">9. Reklamacje i kontakt</h2>
          <p>
            Wszelkie reklamacje dotyczące działania Usługi należy kierować na adres e-mail: 
            <strong className="text-foreground"> pawel.sawczuk.email@gmail.com</strong>. 
            Reklamacja powinna zawierać opis problemu oraz adres e-mail powiązany z Kontem. 
            Odpowiedź zostanie udzielona w terminie 14 dni.
          </p>

          <h2 className="text-base font-semibold text-foreground">10. Zmiany regulaminu</h2>
          <p>
            Usługodawca zastrzega sobie prawo do zmiany Regulaminu. O istotnych zmianach (np. zmiana cennika) 
            Użytkownicy zostaną powiadomieni drogą mailową lub poprzez komunikat w aplikacji z co najmniej 
            7-dniowym wyprzedzeniem.
          </p>

          <h2 className="text-base font-semibold text-foreground">11. Postanowienia końcowe</h2>
          <p>
            W sprawach nieuregulowanych mają zastosowanie przepisy Kodeksu Cywilnego oraz ustawy o 
            świadczeniu usług drogą elektroniczną. Sądem właściwym dla sporów z konsumentami jest sąd 
            właściwy według miejsca zamieszkania konsumenta.
          </p>
        </section>
      </div>
    </main>
  );
}