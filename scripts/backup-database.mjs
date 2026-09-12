#!/usr/bin/env node
// TASK-1.1.2: pg_dump -> gzip -> AES-256-GCM (klucz osobny od ENCRYPTION_KEY appki) -> Vercel
// Blob pod backups/. Szyfrowanie jest konieczne, bo Vercel Blob na planie Hobby/Pro nie ma
// trybu "private + auth" per plik - surowy dump bazy nigdy nie może istnieć w formie czytelnej
// pod jakimkolwiek URL-em. Uruchamiane z .github/workflows/backup-database.yml (harmonogram +
// workflow_dispatch) - patrz docs/backup-i-odzyskiwanie.md po pełną procedurę i zmierzony czas
// realnego odtworzenia.
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { put, list, del } from '@vercel/blob';

const RETENTION_DAYS = 14;
const BACKUP_PREFIX = 'backups/';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function deriveKey(secret) {
  return createHash('sha256').update(secret).digest();
}

// DIRECT_URL w tym projekcie ma ?schema=public (konwencja Prisma) - libpq/pg_dump nie zna
// tego parametru URI i odrzuca całe połączenie ("invalid URI query parameter: schema").
// Wykryte przy lokalnej weryfikacji tego skryptu, patrz docs/backup-i-odzyskiwanie.md.
export function stripPrismaOnlyUrlParams(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.delete('schema');
  return url.toString();
}

async function collectStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function dumpDatabase(databaseUrlRaw) {
  const databaseUrl = stripPrismaOnlyUrlParams(databaseUrlRaw);
  const pgDump = spawn('pg_dump', [databaseUrl, '--format=plain', '--no-owner', '--no-privileges'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const gzip = createGzip({ level: 9 });
  pgDump.stdout.pipe(gzip);

  let stderr = '';
  pgDump.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const [compressed, exitCode] = await Promise.all([
    collectStream(gzip),
    new Promise((resolve, reject) => {
      pgDump.on('error', reject);
      pgDump.on('close', resolve);
    }),
  ]);

  if (exitCode !== 0) {
    throw new Error(`pg_dump exited with code ${exitCode}: ${stderr}`);
  }

  return compressed;
}

// Format pliku: [12 bajtów IV][16 bajtów auth tag][ciphertext] - zwykły konkatenowany
// buffer, nie base64url-z-kropkami jak lib/server/crypto.ts (to osobny, jednorazowy
// artefakt binarny wgrywany do Blob, nie wartość trzymana w kolumnie tekstowej bazy).
export function encryptBuffer(buffer, secret) {
  const iv = randomBytes(12);
  const key = deriveKey(secret);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

async function pruneOldBackups(token) {
  const { blobs } = await list({ prefix: BACKUP_PREFIX, token });
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const stale = blobs.filter((blob) => new Date(blob.uploadedAt).getTime() < cutoff);

  for (const blob of stale) {
    await del(blob.url, { token });
  }

  return stale.length;
}

async function main() {
  const databaseUrl = requireEnv('DIRECT_URL');
  const backupSecret = requireEnv('BACKUP_ENCRYPTION_KEY');

  console.log('[backup] dumping database...');
  const compressed = await dumpDatabase(databaseUrl);
  console.log(`[backup] dump compressed: ${compressed.length} bytes`);

  const encrypted = encryptBuffer(compressed, backupSecret);
  console.log(`[backup] encrypted: ${encrypted.length} bytes`);

  // BACKUP_LOCAL_OUTPUT_FILE: droga wyjścia dla ręcznego/lokalnego backupu i weryfikacji
  // (docs/backup-i-odzyskiwanie.md) bez potrzeby prawdziwego BLOB_READ_WRITE_TOKEN - normalny
  // przebieg (workflow w CI) tej zmiennej nie ustawia, więc zawsze idzie do Vercel Blob.
  const localOutputFile = process.env.BACKUP_LOCAL_OUTPUT_FILE;
  if (localOutputFile) {
    await writeFile(localOutputFile, encrypted);
    console.log(`[backup] written to local file: ${localOutputFile}`);
    return;
  }

  const blobToken = requireEnv('BLOB_READ_WRITE_TOKEN');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const pathname = `${BACKUP_PREFIX}flowstate-${timestamp}.sql.gz.enc`;

  const { url } = await put(pathname, encrypted, {
    access: 'public',
    addRandomSuffix: false,
    token: blobToken,
    contentType: 'application/octet-stream',
  });

  console.log(`[backup] uploaded to ${url}`);

  const pruned = await pruneOldBackups(blobToken);
  console.log(`[backup] pruned ${pruned} backup(s) older than ${RETENTION_DAYS} days`);
}

// Uruchom main() tylko gdy plik jest wywołany bezpośrednio (node scripts/backup-database.mjs),
// nie gdy jest importowany do testów (tests/scripts/backup-restore.test.ts).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[backup] FAILED:', error);
    process.exitCode = 1;
  });
}
