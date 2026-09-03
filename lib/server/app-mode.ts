export type AppMode = 'personal' | 'commercial';

export function resolveAppMode(): AppMode {
  const configured = (process.env.APP_MODE ?? 'personal').toLowerCase();

  if (configured === 'commercial') {
    return 'commercial';
  }

  return 'personal';
}
