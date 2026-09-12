import { describe, expect, it } from 'vitest';
import { encryptBuffer, stripPrismaOnlyUrlParams as stripBackup } from '../../scripts/backup-database.mjs';
import {
  decryptBuffer,
  gunzipBuffer,
  stripPrismaOnlyUrlParams as stripRestore,
} from '../../scripts/restore-database.mjs';
import { gzipSync } from 'node:zlib';

// TASK-1.1.2: warstwa kryptograficzna scripts/backup-database.mjs i scripts/restore-database.mjs.
// Realny round-trip pg_dump -> gzip -> encrypt -> decrypt -> gunzip -> psql zweryfikowany
// ręcznie lokalnie przeciw flowstate_test/flowstate_restore_test (docs/backup-i-odzyskiwanie.md,
// zmierzony czas) - nie da się go uruchomić w Vitest bez pg_dump/psql na PATH. Ten test pokrywa
// część, która faktycznie może się cicho zepsuć przy refaktorze: szyfrowanie/deszyfrowanie i
// sanityzację connection stringa dla libpq.

describe('backup/restore crypto round-trip (TASK-1.1.2)', () => {
  it('encrypts and decrypts back to the original bytes', () => {
    const original = gzipSync(Buffer.from('-- fake SQL dump\nCREATE TABLE x (id int);\n'));
    const secret = 'test-backup-secret';

    const encrypted = encryptBuffer(original, secret);
    expect(encrypted).not.toEqual(original);

    const decrypted = decryptBuffer(encrypted, secret);
    expect(decrypted).toEqual(original);
  });

  it('fails to decrypt with the wrong secret (authenticity check via GCM tag)', () => {
    const original = Buffer.from('sensitive dump content');
    const encrypted = encryptBuffer(original, 'right-secret');

    expect(() => decryptBuffer(encrypted, 'wrong-secret')).toThrow();
  });

  it('round-trips gzip through gunzipBuffer', async () => {
    const original = Buffer.from('some sql content'.repeat(100));
    const compressed = gzipSync(original);

    const decompressed = await gunzipBuffer(compressed);
    expect(decompressed).toEqual(original);
  });

  it('strips the Prisma-only ?schema= param that libpq/pg_dump rejects', () => {
    const withSchema = 'postgresql://postgres:postgres@localhost:5432/flowstate_test?schema=public';
    expect(stripBackup(withSchema)).not.toContain('schema=');
    expect(stripRestore(withSchema)).not.toContain('schema=');
    // host/db/credentials survive the sanitization, only the unsupported param is removed
    expect(stripBackup(withSchema)).toContain('flowstate_test');
  });
});
