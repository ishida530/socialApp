import type { Metadata } from 'next';
import Link from 'next/link';
import { isFreeBeta } from '@/lib/beta';

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
        <p className="mt-2 text-sm text-muted-foreground">Data ostatniej aktualizacji: 3 października 2026 r.</p>

        <section className="mt-8 space-y-4 text-sm leading-6 text-muted-foreground">
          <h2 className="text-base font-semibold text-foreground">1. Postanowienia ogólne</h2>
          <p>
            Niniejszy Regulamin określa zasady korzystania z aplikacji SaaS „Postfly”, służącej
            do planowania i publikacji treści (zdjęć, filmów i tekstów) w serwisach społecznościowych z wykorzystaniem
            oficjalnych integracji API i mechanizmów OAuth. Obecnie dostępne są Facebook, Instagram i LinkedIn; integracje
            z TikTokiem i YouTube zostaną udostępnione po ich zatwierdzeniu przez te platformy.
          </p>
          <p>
            Usługodawcą jest: <strong className="text-foreground">Paweł Sawczuk</strong>, osoba fizyczna, adres: Barczewko
            126B, 11-010 Barczewo, e-mail: <strong className="text-foreground">hello@postfly.pl</strong>.
          </p>
          {isFreeBeta() ? (
            <p>
              Obecnie Usługa jest świadczona nieodpłatnie („okres bezpłatny”, okres startowy) i nie są pobierane
              żadne opłaty. O zakończeniu okresu bezpłatnego i wprowadzeniu płatnych planów
              Usługodawca poinformuje Użytkowników e-mailem z co najmniej 14-dniowym wyprzedzeniem; korzystanie z płatnych
              planów będzie wymagało ich świadomego wyboru przez Użytkownika.
            </p>
          ) : null}

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
            oraz regulaminami platform zewnętrznych (Meta - Facebook i Instagram, LinkedIn, TikTok, Google/YouTube),
            które integruje z Postfly.
          </p>
          <p>
            Umowa o świadczenie Usługi zostaje zawarta z chwilą założenia Konta, po akceptacji Regulaminu. Do
            korzystania z Usługi potrzebne są: urządzenie z dostępem do Internetu, aktualna wersja przeglądarki
            (Chrome, Edge, Firefox lub Safari) z włączoną obsługą JavaScript i plików cookie, aktywny adres e-mail
            oraz - do publikacji - konto w wybranym serwisie społecznościowym.
          </p>

          <h2 className="text-base font-semibold text-foreground">4. Integracje OAuth i API</h2>
          <p>
            Postfly łączy się z kontami społecznościowymi (Meta - Facebook i Instagram, LinkedIn, TikTok, YouTube) wyłącznie
            za zgodą Użytkownika poprzez protokół OAuth. Aplikacja nie gromadzi haseł do serwisów zewnętrznych.
            Użytkownik może w każdej chwili cofnąć uprawnienia dla Postfly bezpośrednio w ustawieniach swojego
            konta danej platformy. Użytkownik może opcjonalnie połączyć konto z botem Postfly w serwisie
            Telegram, żeby zarządzać publikacjami i otrzymywać powiadomienia z poziomu czatu.
          </p>
          <p>
            Postfly korzysta z usług YouTube API (YouTube API Services). Korzystając z funkcji YouTube w Postfly
            (połączenie kanału, publikacja filmów), Użytkownik zgadza się na związanie{' '}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Warunkami korzystania z YouTube (YouTube Terms of Service)
            </a>
            . Przetwarzanie danych z YouTube opisuje{' '}
            <a href="/privacy" className="text-primary underline">
              Polityka prywatności
            </a>{' '}
            (punkt 14), z odwołaniem do{' '}
            <a href="http://www.google.com/policies/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Polityki prywatności Google
            </a>
            . Publikując na TikToku, Użytkownik akceptuje{' '}
            <a
              href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              TikTok Music Usage Confirmation
            </a>{' '}
            (a przy treściach sponsorowanych także{' '}
            <a
              href="https://www.tiktok.com/legal/page/global/bc-policy/en"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              TikTok Branded Content Policy
            </a>
            ). Postfly nie dodaje do publikowanych treści znaków wodnych ani własnego brandingu.
          </p>
          <p lang="en">
            By using the YouTube features of Postfly, users agree to be bound by the YouTube Terms of Service
            (https://www.youtube.com/t/terms).
          </p>

          <h2 className="text-base font-semibold text-foreground">5. Treści i odpowiedzialność</h2>
          <p>
            Użytkownik ponosi wyłączną odpowiedzialność za materiały wideo, opisy oraz inne treści publikowane
            za pośrednictwem Postfly. Zabrania się przesyłania treści naruszających prawo, prawa autorskie osób
            trzecich lub promujących przemoc i nienawiść. Postfly udostępnia opcjonalne funkcje wspomagane przez
            sztuczną inteligencję (m.in. propozycje opisów/hashtagów, sugerowane odpowiedzi na komentarze, tryb
            &quot;Autopilot&quot;) - niezależnie od tego, czy dana treść powstała ręcznie czy z pomocą AI, to
            Użytkownik podejmuje ostateczną decyzję o jej publikacji i ponosi za nią pełną odpowiedzialność.
            Wszelkie prawa do treści wygenerowanych lub zasugerowanych przez funkcje AI w Postfly (opisy,
            hashtagi, propozycje odpowiedzi na komentarze) przysługują Użytkownikowi, który z nich skorzystał -
            Usługodawca nie rości sobie do nich żadnych praw. Szczegóły przetwarzania danych przez AI opisuje
            Polityka Prywatności.
          </p>

          <h2 className="text-base font-semibold text-foreground">6. Płatności i subskrypcje</h2>
          {isFreeBeta() ? (
            <p>
              W okresie bezpłatnym (punkt 1) Usługa jest nieodpłatna, a płatne subskrypcje nie są oferowane. Postanowienia
              dotyczące płatności i subskrypcji zostaną określone w zmienionym Regulaminie, udostępnionym przed
              wprowadzeniem płatnych planów zgodnie z punktem 11.
            </p>
          ) : (
            <p>
              Korzystanie z wybranych funkcjonalności Postfly wymaga opłacenia subskrypcji.
              Płatności są procesowane przez zewnętrznego operatora – <strong className="text-foreground">Stripe</strong>.
              Subskrypcja odnawia się automatycznie, chyba że Użytkownik zrezygnuje z niej przed rozpoczęciem
              kolejnego okresu rozliczeniowego poprzez panel zarządzania płatnościami w aplikacji.
            </p>
          )}

          <h2 className="text-base font-semibold text-foreground">7. Odstąpienie od umowy i zwroty</h2>
          {isFreeBeta() ? (
            <p>
              Użytkownik będący konsumentem ma prawo odstąpić od umowy w terminie 14 dni bez podania przyczyny. W
              okresie bezpłatnym Usługa jest nieodpłatna, więc odstąpienie nie wiąże się z żadnymi rozliczeniami - wystarczy
              usunąć Konto w ustawieniach aplikacji lub napisać na adres z punktu 10.
            </p>
          ) : (
            <p>
              Użytkownik będący konsumentem ma prawo odstąpić od umowy w terminie 14 dni bez podania przyczyny,
              chyba że wyraził zgodę na rozpoczęcie świadczenia usługi (dostarczenie treści cyfrowych) przed
              upływem tego terminu, co skutkuje utratą prawa do odstąpienia. W Postfly dostęp do płatnych
              funkcji jest przyznawany natychmiast po transakcji.
            </p>
          )}

          <h2 className="text-base font-semibold text-foreground">8. Ograniczenie odpowiedzialności</h2>
          <p>
            Usługodawca nie odpowiada za blokady kont społecznościowych, ograniczenia zasięgów lub usunięcie treści
            przez platformy takie jak Facebook, Instagram, LinkedIn, TikTok czy YouTube. Usługodawca nie gwarantuje,
            że API podmiotów trzecich będzie dostępne bez przerw i zmian funkcjonalnych.
            {isFreeBeta()
              ? ' W okresie bezpłatnym Usługodawca nie gwarantuje ciągłej dostępności Usługi; mogą występować przerwy techniczne i zmiany funkcji.'
              : ''}
          </p>

          <h2 className="text-base font-semibold text-foreground">9. Rozwiązanie umowy</h2>
          <p>
            Użytkownik może w każdej chwili rozwiązać umowę, usuwając Konto w ustawieniach aplikacji (Ustawienia
            konta → Usuń konto). Usługodawca może rozwiązać umowę z zachowaniem 14-dniowego okresu wypowiedzenia,
            przesłanego e-mailem, a ze skutkiem natychmiastowym - w razie rażącego naruszenia Regulaminu przez
            Użytkownika (np. publikowania treści bezprawnych lub prób naruszenia bezpieczeństwa Usługi), po
            uprzednim wezwaniu do zaprzestania naruszeń, chyba że wezwanie byłoby bezcelowe.
          </p>

          <h2 className="text-base font-semibold text-foreground">10. Reklamacje i kontakt</h2>
          <p>
            Wszelkie reklamacje dotyczące działania Usługi należy kierować na adres e-mail: 
            <strong className="text-foreground"> hello@postfly.pl</strong>.
            Reklamacja powinna zawierać opis problemu oraz adres e-mail powiązany z Kontem. 
            Odpowiedź zostanie udzielona w terminie 14 dni.
          </p>

          <h2 className="text-base font-semibold text-foreground">11. Zmiany regulaminu</h2>
          <p>
            Usługodawca zastrzega sobie prawo do zmiany Regulaminu z ważnych przyczyn (np. zmiana przepisów,
            zmiana zasad platform zewnętrznych, wprowadzenie płatnych planów). O zmianach Użytkownicy zostaną
            powiadomieni e-mailem z co najmniej 14-dniowym wyprzedzeniem. Użytkownik, który nie akceptuje zmian,
            może przed ich wejściem w życie rozwiązać umowę, usuwając Konto.
          </p>

          <h2 className="text-base font-semibold text-foreground">12. Postanowienia końcowe</h2>
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