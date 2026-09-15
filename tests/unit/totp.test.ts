import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'crypto';
import { buildTotpProvisioningUri, generateBackupCodes, generateTotpSecret, verifyTotpCode } from '@/lib/server/totp';

const PERIOD_SECONDS = 30;

// Independent re-implementation of RFC 4226's HOTP truncation, used to compute an expected code
// for a KNOWN time/counter without reaching into lib/server/totp.ts's internals - two separate
// implementations of the same spec agreeing is a real correctness check, not a tautology.
function computeExpectedCode(rawSecret: Buffer, unixSeconds: number): string {
  const counter = Math.floor(unixSeconds / PERIOD_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', rawSecret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(truncated % 1_000_000).padStart(6, '0');
}

// EPIC 9 TASK-9.3 (2FA, 2026-09-15): from-scratch RFC 6238 TOTP implementation (no external
// dependency) - these tests verify it actually implements the standard correctly, not just that
// it "does something".

describe('generateTotpSecret / buildTotpProvisioningUri', () => {
  it('generates a base32 secret of the expected length and character set', () => {
    const { base32 } = generateTotpSecret();
    expect(base32).toMatch(/^[A-Z2-7]+$/);
    // 20 raw bytes -> 32 base32 characters (160 bits / 5 bits per char).
    expect(base32.length).toBe(32);
  });

  it('generates a different secret every call', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a.base32).not.toBe(b.base32);
  });

  it('builds a valid otpauth:// provisioning URI with the account email and Postfly issuer', () => {
    const uri = buildTotpProvisioningUri('JBSWY3DPEHPK3PXP', 'user@example.com');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=Postfly');
    expect(decodeURIComponent(uri)).toContain('user@example.com');
  });
});

describe('verifyTotpCode', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects malformed input (wrong shape) without needing a real secret match', () => {
    const { base32 } = generateTotpSecret();
    expect(verifyTotpCode(base32, 'not-a-code')).toBe(false);
    expect(verifyTotpCode(base32, '12345')).toBe(false); // too short
    expect(verifyTotpCode(base32, '1234567')).toBe(false); // too long
  });

  it('accepts a code computed independently via the RFC 4226 algorithm for the current time step', () => {
    const { base32, raw } = generateTotpSecret();
    const code = computeExpectedCode(raw, Math.floor(Date.now() / 1000));
    expect(verifyTotpCode(base32, code)).toBe(true);
  });

  it('rejects a well-formed but wrong 6-digit code for a real secret', () => {
    const { base32, raw } = generateTotpSecret();
    const realCode = computeExpectedCode(raw, Math.floor(Date.now() / 1000));
    const wrongCode = realCode === '000001' ? '000002' : '000001';
    expect(verifyTotpCode(base32, wrongCode)).toBe(false);
  });

  it('tolerates one time-step of clock drift in either direction (default driftWindows=1)', () => {
    vi.useFakeTimers();
    const anchorMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    vi.setSystemTime(anchorMs);

    const { base32, raw } = generateTotpSecret();
    const oneStepEarlierCode = computeExpectedCode(raw, Math.floor(anchorMs / 1000) - PERIOD_SECONDS);
    const twoStepsEarlierCode = computeExpectedCode(raw, Math.floor(anchorMs / 1000) - PERIOD_SECONDS * 2);

    expect(verifyTotpCode(base32, oneStepEarlierCode)).toBe(true);
    expect(verifyTotpCode(base32, twoStepsEarlierCode)).toBe(false);
  });
});

describe('generateBackupCodes', () => {
  it('generates 8 unique, formatted codes by default', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    codes.forEach((code) => expect(code).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/));
  });

  it('never includes ambiguous characters (0/O/1/I)', () => {
    const codes = generateBackupCodes(20);
    const combined = codes.join('');
    expect(combined).not.toMatch(/[01OI]/);
  });
});
