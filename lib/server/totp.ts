// EPIC 9 TASK-9.3 (2FA, 2026-09-15): a from-scratch RFC 6238 (TOTP) / RFC 4226 (HOTP)
// implementation using only Node's built-in crypto - deliberately not adding a new npm dependency
// (otplib/speakeasy etc.) for something this small and well-specified, consistent with this
// project's lean-dependency posture elsewhere.
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SECRET_BYTES = 20; // 160 bits, the RFC 4226-recommended HOTP secret length
const CODE_DIGITS = 6;
const PERIOD_SECONDS = 30;

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      continue;
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret(): { raw: Buffer; base32: string } {
  const raw = randomBytes(SECRET_BYTES);
  return { raw, base32: base32Encode(raw) };
}

export function buildTotpProvisioningUri(base32Secret: string, accountEmail: string): string {
  const issuer = 'Postfly';
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  return `otpauth://totp/${label}?secret=${base32Secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${CODE_DIGITS}&period=${PERIOD_SECONDS}`;
}

function computeHotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(truncated % 10 ** CODE_DIGITS).padStart(CODE_DIGITS, '0');
}

// Accepts a code from the current 30s window or one window before/after, to tolerate ordinary
// clock drift between the server and the user's phone - the same tolerance virtually every real
// TOTP implementation uses.
export function verifyTotpCode(base32Secret: string, code: string, driftWindows = 1): boolean {
  const trimmedCode = code.trim();
  if (!/^\d{6}$/.test(trimmedCode)) {
    return false;
  }

  const secret = base32Decode(base32Secret);
  const currentCounter = Math.floor(Date.now() / 1000 / PERIOD_SECONDS);

  for (let drift = -driftWindows; drift <= driftWindows; drift += 1) {
    const candidate = computeHotp(secret, currentCounter + drift);
    if (timingSafeEqual(Buffer.from(candidate), Buffer.from(trimmedCode))) {
      return true;
    }
  }

  return false;
}

const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I - hard to misread
const BACKUP_CODE_LENGTH = 10;
const BACKUP_CODE_COUNT = 8;

function generateBackupCode(): string {
  const bytes = randomBytes(BACKUP_CODE_LENGTH);
  let code = '';
  for (const byte of bytes) {
    code += BACKUP_CODE_ALPHABET[byte % BACKUP_CODE_ALPHABET.length];
  }
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => generateBackupCode());
}
