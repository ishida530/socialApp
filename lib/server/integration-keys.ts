// Per-account API keys for server-to-server integrations (see the IntegrationKey model). The
// plaintext is returned once from createIntegrationKey and never stored - only its SHA-256 hash.
// A random 32-byte key has enough entropy that a fast hash is the right choice (no bcrypt needed:
// there's nothing to brute-force, unlike a human password).
import { createHash, randomBytes } from 'crypto';
import { prisma } from './prisma';

const KEY_PREFIX = 'pfk_';
export const INTEGRATION_KEY_NAME_MAX_LENGTH = 60;
export const MAX_ACTIVE_KEYS_PER_USER = 10;

export function hashIntegrationKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export async function createIntegrationKey(userId: string, name: string) {
  const plaintext = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  const key = await prisma.integrationKey.create({
    data: {
      userId,
      name,
      keyHash: hashIntegrationKey(plaintext),
      keyPrefix: plaintext.slice(0, KEY_PREFIX.length + 6),
    },
    select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true },
  });
  return { key, plaintext };
}

// Resolves "Authorization: Bearer <key>" to the owning user, or null for an unknown/revoked key.
export async function resolveIntegrationKey(bearer: string): Promise<{ userId: string } | null> {
  if (!bearer.startsWith(KEY_PREFIX)) {
    return null;
  }
  const key = await prisma.integrationKey.findUnique({
    where: { keyHash: hashIntegrationKey(bearer) },
    select: { id: true, userId: true, revokedAt: true },
  });
  if (!key || key.revokedAt) {
    return null;
  }
  // Best-effort usage stamp - never blocks or fails the actual request.
  prisma.integrationKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { userId: key.userId };
}
