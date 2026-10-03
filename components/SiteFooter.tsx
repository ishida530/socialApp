import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="w-full overflow-x-clip border-t border-border bg-card/70" role="contentinfo">
      <nav aria-label="Nawigacja stopki" className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center text-sm text-muted-foreground">
          <li>
            <Link href="/" className="transition-colors hover:text-foreground">
              Strona główna
            </Link>
          </li>
          <li>
            <Link href="/#produkt" className="transition-colors hover:text-foreground">
              Jak to działa
            </Link>
          </li>
          <li>
            <Link href="/#funkcje" className="transition-colors hover:text-foreground">
              Funkcje
            </Link>
          </li>
          <li>
            <Link href="/#integracje" className="transition-colors hover:text-foreground">
              Integracje
            </Link>
          </li>
          <li>
            <Link href="/#pricing" className="transition-colors hover:text-foreground">
              Cennik
            </Link>
          </li>
          <li>
            <Link href="/#faq" className="transition-colors hover:text-foreground">
              FAQ
            </Link>
          </li>
          <li>
            <Link href="/#contact" className="transition-colors hover:text-foreground">
              Kontakt
            </Link>
          </li>
          <li>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Regulamin
            </Link>
          </li>
          <li>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Polityka Prywatności
            </Link>
          </li>
        </ul>
      </nav>
      {/* Studio credit (2026-10-03): the usual agency signature - small, muted, under the client's own
          links, opening in a new tab. Postfly was designed and built by Code94. */}
      <p className="mx-auto w-full max-w-7xl px-4 pb-4 pt-2 text-center text-xs text-muted-foreground/80 sm:px-6">
        © {new Date().getFullYear()} Postfly
        <span aria-hidden="true" className="mx-2 text-border">·</span>
        Usługodawca: Paweł Sawczuk,{' '}
        <a href="mailto:hello@postfly.pl" className="transition-colors hover:text-foreground">
          hello@postfly.pl
        </a>{' '}
        (
        <Link href="/terms" className="transition-colors hover:text-foreground">
          dane w Regulaminie
        </Link>
        )
        <span aria-hidden="true" className="mx-2 text-border">·</span>
        Realizacja:{' '}
        <a
          href="https://www.code94.pl"
          target="_blank"
          rel="noopener"
          className="transition-colors hover:text-foreground"
        >
          Code94
        </a>
      </p>
    </footer>
  );
}
