import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center space-y-3">
        <h1 className="text-lg font-semibold text-foreground">Nie znaleziono strony</h1>
        <p className="text-sm text-muted-foreground">Ta strona nie istnieje albo została przeniesiona.</p>
        <Link href="/" className="inline-flex px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
          Strona główna
        </Link>
      </div>
    </main>
  );
}
