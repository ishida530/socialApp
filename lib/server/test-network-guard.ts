import http from 'node:http';
import https from 'node:https';

// TASK-1.1.1: żadne żądanie sieciowe wychodzące ze środowiska testowego nie może
// realnie dotrzeć do platform OAuth - błąd kodu (albo pomyłkowo wklejony prawdziwy
// token do .env) nigdy nie ma szansy nic opublikować/pobrać z prawdziwego konta,
// bo samo połączenie jest blokowane zanim wyjdzie z procesu Node.
const BLOCKED_HOST_SUFFIXES = [
  'googleapis.com',
  'google.com',
  'tiktokapis.com',
  'tiktok.com',
  'facebook.com',
  'telegram.org',
];

export function isBlockedHost(hostname: string | undefined | null): boolean {
  if (!hostname) {
    return false;
  }

  const host = hostname.toLowerCase();
  return BLOCKED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function blockedError(hostname: string): Error {
  return new Error(
    `[test-network-guard] Zablokowano żądanie sieciowe do prawdziwej platformy "${hostname}" ` +
      'w środowisku testowym (TASK-1.1.1, docs/postfly-plan-projektu.md sekcja 3). ' +
      'Testy nigdy nie łączą się z prawdziwymi platformami OAuth - zamockuj to wywołanie.',
  );
}

function extractHostnameFromFetchInput(input: unknown): string | undefined {
  if (typeof input === 'string') {
    try {
      return new URL(input).hostname;
    } catch {
      return undefined;
    }
  }

  if (input instanceof URL) {
    return input.hostname;
  }

  if (input && typeof input === 'object' && 'url' in input) {
    try {
      return new URL((input as { url: string }).url).hostname;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function extractHostnameFromHttpArgs(args: unknown[]): string | undefined {
  const [first] = args;

  if (typeof first === 'string') {
    try {
      return new URL(first).hostname;
    } catch {
      return undefined;
    }
  }

  if (first instanceof URL) {
    return first.hostname;
  }

  if (first && typeof first === 'object') {
    const opts = first as { hostname?: string; host?: string };
    return opts.hostname ?? opts.host;
  }

  return undefined;
}

let installed = false;

// Idempotentne: setup-env.ts (Vitest) i instrumentation.ts (serwer Next.js pod
// NODE_ENV=test) mogą oba wywołać tę funkcję bez ryzyka podwójnego owinięcia fetch/http.
export function installNetworkGuard(): void {
  if (installed) {
    return;
  }
  installed = true;

  const originalFetch = globalThis.fetch;
  if (originalFetch) {
    globalThis.fetch = ((input: unknown, init?: unknown) => {
      const hostname = extractHostnameFromFetchInput(input);
      if (isBlockedHost(hostname)) {
        return Promise.reject(blockedError(hostname as string));
      }

      return originalFetch(input as never, init as never);
    }) as typeof fetch;
  }

  // google-auth-library (lib/server/google-auth.ts) idzie przez gaxios -> node-fetch,
  // które łączy się przez node:http/node:https, nie przez globalThis.fetch - stąd
  // osobna blokada na tym poziomie, żeby pokryć też tę ścieżkę.
  for (const mod of [http, https]) {
    const originalRequest = mod.request.bind(mod);
    const originalGet = mod.get.bind(mod);

    mod.request = ((...args: unknown[]) => {
      const hostname = extractHostnameFromHttpArgs(args);
      if (isBlockedHost(hostname)) {
        throw blockedError(hostname as string);
      }

      return (originalRequest as (...a: unknown[]) => unknown)(...args);
    }) as typeof mod.request;

    mod.get = ((...args: unknown[]) => {
      const hostname = extractHostnameFromHttpArgs(args);
      if (isBlockedHost(hostname)) {
        throw blockedError(hostname as string);
      }

      return (originalGet as (...a: unknown[]) => unknown)(...args);
    }) as typeof mod.get;
  }
}
