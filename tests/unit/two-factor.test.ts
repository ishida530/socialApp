import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import { prisma } from '@/lib/server/prisma';
import { decrypt } from '@/lib/server/crypto';
import {
  createTrustedDeviceToken,
  disableTwoFactor,
  enableTwoFactor,
  forgetAllTrustedDevices,
  startTwoFactorSetup,
  verifyTrustedDeviceToken,
  verifyTwoFactorForLogin,
} from '@/lib/server/two-factor';
import { hashPassword } from '@/lib/server/crypto';
import { createTestUser, deleteTestUser } from '../helpers/fixtures';

// EPIC 9 TASK-9.3 (2FA, 2026-09-15).

function computeCode(base32: string, unixSeconds = Math.floor(Date.now() / 1000)): string {
  // Mirrors lib/server/totp.ts's base32Decode/computeHotp exactly, kept independent here so this
  // is a real cross-check, not the implementation testing itself.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of base32.toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const secret = Buffer.from(bytes);
  const counter = Math.floor(unixSeconds / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(truncated % 1_000_000).padStart(6, '0');
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('startTwoFactorSetup', () => {
  it('stores an encrypted pending secret without touching twoFactorEnabled', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const result = await startTwoFactorSetup(user.id, user.email);
    expect(result.otpauthUrl).toContain(result.secret);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.twoFactorEnabled).toBe(false);
    expect(refreshed.twoFactorPendingSecretEncrypted).not.toBeNull();
    expect(decrypt(refreshed.twoFactorPendingSecretEncrypted!)).toBe(result.secret);
  });

  it('a second call overwrites the first pending secret, never the already-active one', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const first = await startTwoFactorSetup(user.id, user.email);
    const second = await startTwoFactorSetup(user.id, user.email);
    expect(first.secret).not.toBe(second.secret);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(decrypt(refreshed.twoFactorPendingSecretEncrypted!)).toBe(second.secret);
  });
});

describe('enableTwoFactor', () => {
  it('rejects when no setup was started', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const result = await enableTwoFactor(user.id, '123456');
    expect(result.ok).toBe(false);
  });

  it('rejects an incorrect code without enabling anything', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await startTwoFactorSetup(user.id, user.email);

    const result = await enableTwoFactor(user.id, '000000');
    expect(result.ok).toBe(false);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.twoFactorEnabled).toBe(false);
  });

  it('enables 2FA with the correct code and returns 8 backup codes', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const setup = await startTwoFactorSetup(user.id, user.email);
    const code = computeCode(setup.secret);

    const result = await enableTwoFactor(user.id, code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backupCodes).toHaveLength(8);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.twoFactorEnabled).toBe(true);
    expect(refreshed.twoFactorPendingSecretEncrypted).toBeNull();
    expect(refreshed.twoFactorBackupCodeHashes).toHaveLength(8);
  });
});

describe('disableTwoFactor', () => {
  async function enableForUser(userId: string, email: string, password: string) {
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(password) } });
    const setup = await startTwoFactorSetup(userId, email);
    await enableTwoFactor(userId, computeCode(setup.secret));
    return setup.secret;
  }

  it('requires the correct password', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const secret = await enableForUser(user.id, user.email, 'correct-password');

    const result = await disableTwoFactor(user.id, 'wrong-password', computeCode(secret));
    expect(result.ok).toBe(false);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.twoFactorEnabled).toBe(true);
  });

  it('requires a correct code even with the correct password', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await enableForUser(user.id, user.email, 'correct-password');

    const result = await disableTwoFactor(user.id, 'correct-password', '000000');
    expect(result.ok).toBe(false);
  });

  it('disables 2FA and clears the secret/backup codes with correct password + code', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const secret = await enableForUser(user.id, user.email, 'correct-password');

    const result = await disableTwoFactor(user.id, 'correct-password', computeCode(secret));
    expect(result.ok).toBe(true);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.twoFactorEnabled).toBe(false);
    expect(refreshed.twoFactorSecretEncrypted).toBeNull();
    expect(refreshed.twoFactorBackupCodeHashes).toHaveLength(0);
  });

  it('also forgets every trusted device - a stale cookie must never resurrect the bypass if 2FA is re-enabled', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const secret = await enableForUser(user.id, user.email, 'correct-password');
    const rawToken = await createTrustedDeviceToken(user.id);
    expect(await verifyTrustedDeviceToken(user.id, rawToken)).toBe(true);

    await disableTwoFactor(user.id, 'correct-password', computeCode(secret));

    expect(await verifyTrustedDeviceToken(user.id, rawToken)).toBe(false);
  });
});

describe('createTrustedDeviceToken / verifyTrustedDeviceToken', () => {
  it('a freshly created token verifies for its own user', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const rawToken = await createTrustedDeviceToken(user.id);
    expect(await verifyTrustedDeviceToken(user.id, rawToken)).toBe(true);
  });

  it('rejects a token that belongs to a different user', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const { user: otherUser } = await createTestUser();

    try {
      const rawToken = await createTrustedDeviceToken(otherUser.id);
      expect(await verifyTrustedDeviceToken(user.id, rawToken)).toBe(false);
    } finally {
      await deleteTestUser(otherUser.id);
    }
  });

  it('rejects a made-up token', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    expect(await verifyTrustedDeviceToken(user.id, 'not-a-real-token')).toBe(false);
  });

  it('rejects an expired token', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const rawToken = await createTrustedDeviceToken(user.id);
    await prisma.twoFactorTrustedDevice.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await verifyTrustedDeviceToken(user.id, rawToken)).toBe(false);
  });
});

describe('forgetAllTrustedDevices', () => {
  it('deletes every trusted device for the user and reports how many', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const tokenA = await createTrustedDeviceToken(user.id);
    const tokenB = await createTrustedDeviceToken(user.id);

    const result = await forgetAllTrustedDevices(user.id);
    expect(result.count).toBe(2);

    expect(await verifyTrustedDeviceToken(user.id, tokenA)).toBe(false);
    expect(await verifyTrustedDeviceToken(user.id, tokenB)).toBe(false);
  });

  it('never touches another user\'s trusted devices', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const { user: otherUser } = await createTestUser();

    try {
      const otherToken = await createTrustedDeviceToken(otherUser.id);
      await forgetAllTrustedDevices(user.id);
      expect(await verifyTrustedDeviceToken(otherUser.id, otherToken)).toBe(true);
    } finally {
      await deleteTestUser(otherUser.id);
    }
  });

  it('returns count 0 and does not throw when there is nothing to forget', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const result = await forgetAllTrustedDevices(user.id);
    expect(result.count).toBe(0);
  });
});

describe('verifyTwoFactorForLogin', () => {
  it('accepts a valid TOTP code', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const setup = await startTwoFactorSetup(user.id, user.email);
    await enableTwoFactor(user.id, computeCode(setup.secret));

    expect(await verifyTwoFactorForLogin(user.id, computeCode(setup.secret))).toBe(true);
  });

  it('accepts a valid backup code exactly once, then rejects it on reuse', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const setup = await startTwoFactorSetup(user.id, user.email);
    const enableResult = await enableTwoFactor(user.id, computeCode(setup.secret));
    if (!enableResult.ok) throw new Error('setup failed');
    const backupCode = enableResult.backupCodes[0];

    expect(await verifyTwoFactorForLogin(user.id, backupCode)).toBe(true);
    expect(await verifyTwoFactorForLogin(user.id, backupCode)).toBe(false);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.twoFactorBackupCodeHashes).toHaveLength(7);
  });

  it('rejects a wrong code for a user with no 2FA configured', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    expect(await verifyTwoFactorForLogin(user.id, '123456')).toBe(false);
  });
});
