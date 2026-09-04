import { prisma } from '@/lib/server/prisma';

export type AppMode = 'personal' | 'commercial';

export function resolveAppMode(): AppMode {
  const configured = (process.env.APP_MODE ?? 'personal').toLowerCase();

  if (configured === 'commercial') {
    return 'commercial';
  }

  return 'personal';
}

// Single source of truth for "can anyone still register" — shared by the register
// endpoint itself and the register-status check the UI uses to warn before the form
// is even filled in, so the two can't drift out of sync.
export async function isRegistrationOpen(): Promise<boolean> {
  if (resolveAppMode() !== 'personal') {
    return true;
  }

  const existingUsersCount = await prisma.user.count();
  return existingUsersCount === 0;
}
