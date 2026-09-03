export type AppMode = 'personal' | 'commercial';

/**
 * Client-safe counterpart of lib/server/app-mode.ts — reads the public env var
 * (inlined at build time) since NEXT_PUBLIC_APP_MODE is baked into the client
 * bundle the same way APP_MODE is read server-side.
 */
export function resolvePublicAppMode(): AppMode {
  const configured = (process.env.NEXT_PUBLIC_APP_MODE ?? 'personal').toLowerCase();

  if (configured === 'commercial') {
    return 'commercial';
  }

  return 'personal';
}

export function isPersonalMode() {
  return resolvePublicAppMode() === 'personal';
}
