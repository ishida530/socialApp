import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Regulamin | FlowState',
  description: 'Regulamin świadczenia usług drogą elektroniczną dla FlowState.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Regulamin usługi FlowState</h1>
        <p className="mt-6 text-sm text-muted-foreground">Data wejścia w życie: 2 marca 2026 r.</p>

        <section className="mt-8 space-y-4 text-sm leading-6 text-muted-foreground">
          <h2 className="text-base font-semibold text-foreground">1. Postanowienia ogólne</h2>
          <p>
            Niniejszy Regulamin określa zasady korzystania z aplikacji SaaS „FlowState”, służącej
            do planowania i publikacji materiałów wideo w serwisach społecznościowych (w tym
            TikTok) z wykorzystaniem integracji API i OAuth.
          </p>
          <p>
            Usługodawcą jest: <strong className="text-foreground">Code94 Paweł Sawczuk</strong>,
            adres: 126B, 11-010 Barczewko, NIP: 7394015517, REGON: 541491536.
          </p>

          <h2 className="text-base font-semibold text-foreground">2. Definicje</h2>
          <p>
            Użytkownik – osoba fizyczna lub podmiot korzystający z FlowState. Konto – profil
            Użytkownika w aplikacji. Usługa – funkcjonalności FlowState, w tym planowanie,
            zarządzanie i zautomatyzowana publikacja treści.
          </p>

          <h2 className="text-base font-semibold text-foreground">3. Warunki korzystania</h2>
          <p>
            Z usługi może korzystać wyłącznie osoba, która ukończyła 18 lat oraz ma pełną zdolność
            do czynności prawnych albo działa w imieniu uprawnionego podmiotu.
          </p>
          <p>
            Użytkownik zobowiązuje się korzystać z usługi zgodnie z prawem, niniejszym Regulaminem
            oraz zasadami platform społecznościowych, których konto podłączył.
          </p>

          <h2 className="text-base font-semibold text-foreground">4. Konto i integracje OAuth</h2>
          <p>
            Logowanie i autoryzacja kont społecznościowych odbywają się przez mechanizm OAuth.
            FlowState nie pozyskuje ani nie przechowuje haseł do kont TikTok/YouTube.
          </p>
          <p>
            Użytkownik odpowiada za utrzymanie ważności udzielonych zgód OAuth i za działania
            wykonane z wykorzystaniem podłączonych kont.
          </p>

          <h2 className="text-base font-semibold text-foreground">5. Publikowane treści i odpowiedzialność Użytkownika</h2>
          <p>
            Użytkownik ponosi pełną odpowiedzialność za treści przesyłane i publikowane przez
            FlowState, w tym za ich zgodność z prawem, prawami autorskimi, prawami osób trzecich
            oraz regulaminami platform społecznościowych.
          </p>
          <p>
            Zabronione jest publikowanie treści bezprawnych, szkodliwych, naruszających dobra
            osobiste, prawa własności intelektualnej lub zasady platform zewnętrznych.
          </p>

          <h2 className="text-base font-semibold text-foreground">6. Subskrypcje, płatności i odnowienia</h2>
          <p>
            FlowState oferuje plany subskrypcyjne (w tym Free, Pro, Premium) z limitami użycia,
            m.in. liczby uploadów wideo i zadań publikacji.
          </p>
          <p>
            Płatności realizowane są wyłącznie przez Stripe. Usługodawca nie przechowuje pełnych
            danych kart płatniczych.
          </p>
          <p>
            Subskrypcja odnawia się automatycznie na kolejny okres rozliczeniowy, dopóki nie
            zostanie anulowana przez Użytkownika w Billing Portal lub zgodnie z warunkami Stripe.
          </p>

          <h2 className="text-base font-semibold text-foreground">7. Polityka zwrotów</h2>
          <p>
            Usługa ma charakter cyfrowy i jest świadczona niezwłocznie po aktywacji. W zakresie
            dozwolonym przez przepisy prawa, po rozpoczęciu świadczenia usługi możliwość zwrotu
            opłaty może być ograniczona. Każdy wniosek o zwrot analizowany jest indywidualnie.
          </p>

          <h2 className="text-base font-semibold text-foreground">8. Dostępność i zmiany usługi</h2>
          <p>
            Usługodawca dokłada należytej staranności, aby zapewnić ciągłość działania usługi,
            jednak może czasowo ograniczyć jej dostępność z przyczyn technicznych, bezpieczeństwa,
            konserwacji lub działania dostawców zewnętrznych.
          </p>

          <h2 className="text-base font-semibold text-foreground">9. Ograniczenie odpowiedzialności</h2>
          <p>
            W maksymalnym zakresie dopuszczonym przez prawo, Usługodawca nie odpowiada za skutki
            decyzji platform zewnętrznych (np. blokady konta, ograniczenia zasięgów, zmiany API,
            odmowę publikacji treści), ani za szkody pośrednie i utracone korzyści wynikające z
            korzystania z usługi.
          </p>

          <h2 className="text-base font-semibold text-foreground">10. Rozwiązanie umowy i usunięcie konta</h2>
          <p>
            Użytkownik może w każdej chwili zaprzestać korzystania z usługi i żądać usunięcia konta.
            Usługodawca może zawiesić lub zakończyć świadczenie usługi wobec Użytkownika w razie
            naruszenia Regulaminu lub przepisów prawa.
          </p>

          <h2 className="text-base font-semibold text-foreground">11. Reklamacje i kontakt</h2>
          <p>
            W sprawach dotyczących usługi, reklamacji lub danych osobowych należy kontaktować się
            z Usługodawcą: Code94 Paweł Sawczuk, 126B, 11-010 Barczewko, NIP 7394015517, REGON
            541491536, e-mail: pawel.sawczuk.email@gmail.com.
          </p>

          <h2 className="text-base font-semibold text-foreground">12. Postanowienia końcowe</h2>
          <p>
            Regulamin może być aktualizowany w związku ze zmianami prawa, zakresem usługi lub
            wymogami dostawców zewnętrznych. O istotnych zmianach Użytkownik zostanie poinformowany
            w aplikacji lub przy kolejnym logowaniu.
          </p>
          <p>
            W sprawach nieuregulowanych zastosowanie mają przepisy prawa polskiego oraz odpowiednie
            przepisy prawa Unii Europejskiej.
          </p>
        </section>
      </div>
    </main>
  );
}
