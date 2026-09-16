// EPIC 9 TASK-9.3 (2FA, 2026-09-15). Business logic for setup/enable/disable/login-verification -
// kept separate from the API routes (lib/server/* convention used throughout this app) so it's
// directly unit-testable without going through NextRequest/NextResponse plumbing.
import { randomBytes, createHash } from 'crypto';
import { prisma } from './prisma';
import { encrypt, decrypt, hashPassword, verifyPassword } from './crypto';
import { buildTotpProvisioningUri, generateBackupCodes, generateTotpSecret, verifyTotpCode } from './totp';
import { recordAuditLog } from './audit-log';
import { TWO_FACTOR_REMEMBER_MAX_AGE_SEC } from './auth';

export type StartTwoFactorSetupResult = { secret: string; otpauthUrl: string };

// Generates a NEW pending secret every time it's called (overwriting any previous unconfirmed
// attempt) - deliberately does not touch the already-active secret, so starting a fresh setup
// attempt (e.g. after losing the QR code) never breaks or silently changes 2FA that's already on.
export async function startTwoFactorSetup(userId: string, email: string): Promise<StartTwoFactorSetupResult> {
  const { base32 } = generateTotpSecret();

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorPendingSecretEncrypted: encrypt(base32) },
  });

  return { secret: base32, otpauthUrl: buildTotpProvisioningUri(base32, email) };
}

export type EnableTwoFactorResult = { ok: true; backupCodes: string[] } | { ok: false; error: string };

export async function enableTwoFactor(userId: string, code: string): Promise<EnableTwoFactorResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorPendingSecretEncrypted: true },
  });

  if (!user?.twoFactorPendingSecretEncrypted) {
    return { ok: false, error: 'Najpierw rozpocznij konfigurację 2FA.' };
  }

  const pendingSecret = decrypt(user.twoFactorPendingSecretEncrypted);
  if (!verifyTotpCode(pendingSecret, code)) {
    return { ok: false, error: 'Nieprawidłowy kod. Sprawdź godzinę w telefonie i spróbuj ponownie.' };
  }

  const backupCodes = generateBackupCodes();
  const backupCodeHashes = backupCodes.map((backupCode) => hashPassword(backupCode));

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      twoFactorSecretEncrypted: user.twoFactorPendingSecretEncrypted,
      twoFactorPendingSecretEncrypted: null,
      twoFactorBackupCodeHashes: backupCodeHashes,
    },
  });

  await recordAuditLog({ userId, actor: 'user', action: '2fa.enabled' });

  return { ok: true, backupCodes };
}

export type DisableTwoFactorResult = { ok: true } | { ok: false; error: string };

export async function disableTwoFactor(userId: string, password: string, code: string): Promise<DisableTwoFactorResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, twoFactorEnabled: true, twoFactorSecretEncrypted: true },
  });

  if (!user?.twoFactorEnabled || !user.twoFactorSecretEncrypted) {
    return { ok: false, error: '2FA nie jest włączone.' };
  }

  if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return { ok: false, error: 'Nieprawidłowe hasło.' };
  }

  const secret = decrypt(user.twoFactorSecretEncrypted);
  if (!verifyTotpCode(secret, code)) {
    return { ok: false, error: 'Nieprawidłowy kod.' };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      twoFactorSecretEncrypted: null,
      twoFactorPendingSecretEncrypted: null,
      twoFactorBackupCodeHashes: [],
    },
  });

  // Trusted devices only ever exist to skip the SECOND factor - with 2FA off there's no second
  // factor left to skip, and leaving them around would let a stale trusted-device cookie silently
  // resurrect the bypass the moment 2FA is re-enabled, without the user ever re-confirming trust.
  await prisma.twoFactorTrustedDevice.deleteMany({ where: { userId } });

  await recordAuditLog({ userId, actor: 'user', action: '2fa.disabled' });

  return { ok: true };
}

// Used by the login flow's second step - accepts either a real TOTP code or a one-time backup
// code (consumed immediately on use, same "single use" guarantee every backup-code scheme needs).
export async function verifyTwoFactorForLogin(userId: string, code: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecretEncrypted: true, twoFactorBackupCodeHashes: true },
  });

  if (!user?.twoFactorSecretEncrypted) {
    return false;
  }

  const secret = decrypt(user.twoFactorSecretEncrypted);
  if (verifyTotpCode(secret, code)) {
    return true;
  }

  const trimmedCode = code.trim();
  const matchIndex = user.twoFactorBackupCodeHashes.findIndex((hash) => verifyPassword(trimmedCode, hash));
  if (matchIndex === -1) {
    return false;
  }

  const remainingCodes = [...user.twoFactorBackupCodeHashes];
  remainingCodes.splice(matchIndex, 1);
  await prisma.user.update({ where: { id: userId }, data: { twoFactorBackupCodeHashes: remainingCodes } });
  await recordAuditLog({ userId, actor: 'user', action: '2fa.backup_code_used' });

  return true;
}

// "Remember this device" (2026-09-16) - called from POST /api/auth/2fa/login right after a
// successful code check, only when the user opted in. Returns the RAW token to put in the
// cookie; only its sha256 hash is ever stored, same pattern as PasswordResetToken/TelegramLinkCode
// (lib/server/prisma schema) - a leaked DB row alone can't be replayed as a cookie value.
export async function createTrustedDeviceToken(userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  await prisma.twoFactorTrustedDevice.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + TWO_FACTOR_REMEMBER_MAX_AGE_SEC * 1000),
    },
  });

  await recordAuditLog({ userId, actor: 'user', action: '2fa.device_remembered' });

  return rawToken;
}

// Lets a user revoke every trusted device at once (e.g. accidentally trusted a shared/public
// computer) without disabling and re-enabling 2FA entirely. Does NOT touch twoFactorEnabled or
// the secret - purely forgets devices, same as disableTwoFactor's cleanup but callable on its own.
export async function forgetAllTrustedDevices(userId: string): Promise<{ count: number }> {
  const { count } = await prisma.twoFactorTrustedDevice.deleteMany({ where: { userId } });
  if (count > 0) {
    await recordAuditLog({ userId, actor: 'user', action: '2fa.devices_forgotten', metadata: { count } });
  }
  return { count };
}

// Called from POST /api/auth/login, BEFORE the requiresTwoFactor branch - if this returns true,
// the login route skips straight to issuing a real session, exactly as if 2FA were off. Never
// substitutes for the password check, which always runs first regardless. Fixed 30-day expiry
// from creation (not sliding on use) - a device that's actually used regularly still needs to
// re-confirm the second factor at least monthly, deliberately not "trust forever".
export async function verifyTrustedDeviceToken(userId: string, rawToken: string): Promise<boolean> {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  const device = await prisma.twoFactorTrustedDevice.findUnique({ where: { tokenHash } });
  if (!device || device.userId !== userId || device.expiresAt < new Date()) {
    return false;
  }

  await prisma.twoFactorTrustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });

  return true;
}
