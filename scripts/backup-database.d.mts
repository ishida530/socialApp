// Types for the exports of backup-database.mjs (2026-10-02): Next 16.3 type-checks the whole
// project during `next build`, including tests/api/backup-crypto.test.ts, which imports this script.
export function deriveKey(secret: string): Buffer;
export function stripPrismaOnlyUrlParams(connectionString: string): string;
export function encryptBuffer(buffer: Buffer, secret: string): Buffer;
