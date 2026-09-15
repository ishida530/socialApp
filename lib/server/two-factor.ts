// EPIC 9 TASK-9.3 (2FA, 2026-09-15). Business logic for setup/enable/disable/login-verification -
// kept separate from the API routes (lib/server/* convention used throughout this app) so it's
// directly unit-testable without going through NextRequest/NextResponse plumbing.
import { prisma } from './prisma';
import { encrypt, decrypt, hashPassword, verifyPassword } from './crypto';
import { buildTotpProvisioningUri, generateBackupCodes, generateTotpSecret, verifyTotpCode } from './totp';
import { recordAuditLog } from './audit-log';

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
