import type { Prisma } from '@prisma/client';

// The only SocialAccount fields that may leave the server in an API response (2026-10-01). Never
// accessToken/refreshToken (encrypted at rest, but still not for the browser) nor the internal
// sticky-default columns. Use it for every include/select whose result is returned to a client;
// server-only code that needs tokens keeps reading them explicitly.
export const PUBLIC_SOCIAL_ACCOUNT_SELECT = {
  id: true,
  userId: true,
  platform: true,
  handle: true,
  externalId: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.SocialAccountSelect;
