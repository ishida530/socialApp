import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import { POST as setupRoute } from '@/app/api/auth/2fa/setup/route';
import { POST as enableRoute } from '@/app/api/auth/2fa/enable/route';
import { POST as disableRoute } from '@/app/api/auth/2fa/disable/route';
import { prisma } from '@/lib/server/prisma';
import { hashPassword } from '@/lib/server/crypto';
import { createTestUser, deleteTestUser, authHeaders, jsonRequest } from '../helpers/fixtures';

// EPIC 9 TASK-9.3 (2FA, 2026-09-15) - HTTP-level coverage of the setup/enable/disable routes.
// Business-logic correctness (RFC 4226 algorithm, backup codes, etc.) is covered in
// tests/unit/totp.test.ts and tests/unit/two-factor.test.ts - this is about auth/wiring.

const SETUP_URL = 'http://localhost:3000/api/auth/2fa/setup';
const ENABLE_URL = 'http://localhost:3000/api/auth/2fa/enable';
const DISABLE_URL = 'http://localhost:3000/api/auth/2fa/disable';

function computeCode(base32: string): string {
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
  const counter = Math.floor(Date.now() / 1000 / 30);
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

describe('POST /api/auth/2fa/setup', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await setupRoute(jsonRequest(SETUP_URL, {}));
    expect(response.status).toBe(401);
  });

  it('returns a secret and otpauth URI for an authenticated user', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await setupRoute(jsonRequest(SETUP_URL, {}, authHeaders(token)));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(body.otpauthUrl).toContain(body.secret);
  });
});

describe('POST /api/auth/2fa/enable', () => {
  it('rejects a missing code', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await enableRoute(jsonRequest(ENABLE_URL, {}, authHeaders(token)));
    expect(response.status).toBe(400);
  });

  it('enables 2FA end-to-end and returns backup codes', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const setupResponse = await setupRoute(jsonRequest(SETUP_URL, {}, authHeaders(token)));
    const { secret } = await setupResponse.json();

    const response = await enableRoute(jsonRequest(ENABLE_URL, { code: computeCode(secret) }, authHeaders(token)));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.backupCodes).toHaveLength(8);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.twoFactorEnabled).toBe(true);
  });
});

describe('POST /api/auth/2fa/disable', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await disableRoute(jsonRequest(DISABLE_URL, {}));
    expect(response.status).toBe(401);
  });

  it('disables 2FA with the correct password and code', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword('correct-password') } });

    const setupResponse = await setupRoute(jsonRequest(SETUP_URL, {}, authHeaders(token)));
    const { secret } = await setupResponse.json();
    await enableRoute(jsonRequest(ENABLE_URL, { code: computeCode(secret) }, authHeaders(token)));

    const response = await disableRoute(
      jsonRequest(DISABLE_URL, { password: 'correct-password', code: computeCode(secret) }, authHeaders(token)),
    );
    expect(response.status).toBe(200);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.twoFactorEnabled).toBe(false);
  });
});
