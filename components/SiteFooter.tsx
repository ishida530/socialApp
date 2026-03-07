import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="w-full overflow-x-clip border-t border-border bg-card/70" role="contentinfo">
      <nav aria-label="Nawigacja stopki" className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center text-sm text-muted-foreground">
          <li>
            <Link href="/" className="transition-colors hover:text-foreground">
              Strona główna
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
    </footer>
  );
}
