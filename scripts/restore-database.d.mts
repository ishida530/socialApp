// Types for the exports of restore-database.mjs (2026-10-02) - see backup-database.d.mts.
export function deriveKey(secret: string): Buffer;
export function stripPrismaOnlyUrlParams(connectionString: string): string;
export function decryptBuffer(buffer: Buffer, secret: string): Buffer;
export function gunzipBuffer(buffer: Buffer): Promise<Buffer>;
