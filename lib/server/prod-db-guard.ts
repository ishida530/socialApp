// BUG-001: `next build`/`next start` uruchomione lokalnie bez jawnego NODE_ENV=test
// domyślnie wchodzą w tryb production, w którym Next.js ładuje .env.production.local
// z WYŻSZYM priorytetem niż .env. Jeśli ktoś kiedyś ściągnął produkcyjne sekrety na tę
// maszynę (np. `vercel env pull`), taki lokalny serwer cicho łączy się z prawdziwą bazą
// produkcyjną zamiast z lokalnym Dockerem. Ten guard zatrzymuje serwer, zanim to się
// stanie - patrz BUGS.md.
const LOCAL_DB_HOST_PATTERNS = [/^localhost$/i, /^127\.0\.0\.1$/, /^host\.docker\.internal$/i, /^postgres$/i];

export function isLocalDatabaseHost(hostname: string): boolean {
  return LOCAL_DB_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

export function assertNotAccidentallyProductionDatabase(): void {
  // Prawdziwy deployment na Vercel ma VERCEL_URL ustawiony przez samą platformę,
  // niezależnie od jakiegokolwiek pliku .env - to jedyny sygnał, którego lokalnie
  // ściągnięty .env.production.local (ma VERCEL_URL="" puste) nie podrabia. Ten check
  // nigdy nie blokuje prawdziwej produkcji, tylko lokalne uruchomienie z zapomnianym
  // plikiem sekretów.
  if (process.env.VERCEL_URL) {
    return;
  }

  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    return;
  }

  let hostname: string;
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    return;
  }

  if (!isLocalDatabaseHost(hostname)) {
    throw new Error(
      `[prod-db-guard] Lokalne uruchomienie (next build/next start) próbuje połączyć się z bazą ` +
        `"${hostname}", która nie wygląda na lokalną (BUG-001, BUGS.md). Prawdopodobnie ` +
        '.env.production.local przykrywa .env dzięki wbudowanej kolejności ładowania env w Next.js. ' +
        'Użyj `npm run build:test` / `npm run start:test` (NODE_ENV=test) do lokalnego testowania, ' +
        'nigdy zwykłego build/start bez jawnie ustawionego NODE_ENV.',
    );
  }
}
