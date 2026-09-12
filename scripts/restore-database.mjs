#!/usr/bin/env node
// TASK-1.1.2: odwrotność scripts/backup-database.mjs. Celowo wymaga RESTORE_TARGET_DATABASE_URL
// (nie DATABASE_URL/DIRECT_URL) - osobna nazwa zmiennej to świadome zabezpieczenie przed
// przypadkowym odtworzeniem NA żywej bazie appki przez pomyłkowe podstawienie normalnego env.
// Użycie:
//   RESTORE_TARGET_DATABASE_URL=... BACKUP_ENCRYPTION_KEY=... node scripts/restore-database.mjs --file=backup.sql.gz.enc
//   RESTORE_TARGET_DATABASE_URL=... BACKUP_ENCRYPTION_KEY=... BLOB_READ_WRITE_TOKEN=... node scripts/restore-database.mjs
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { createDecipheriv, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { list } from '@vercel/blob';

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

// Patrz identyczny komentarz w backup-database.mjs - psql/libpq też nie zna ?schema=.
export function stripPrismaOnlyUrlParams(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.delete('schema');
  return url.toString();
}

export function decryptBuffer(buffer, secret) {
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);
  const key = deriveKey(secret);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export async function gunzipBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    const chunks = [];
    gunzip.on('data', (chunk) => chunks.push(chunk));
    gunzip.on('end', () => resolve(Buffer.concat(chunks)));
    gunzip.on('error', reject);
    gunzip.end(buffer);
  });
}

async function fetchLatestBackup(token) {
  const { blobs } = await list({ prefix: 'backups/', token });
  if (blobs.length === 0) {
    throw new Error('No backups found in Vercel Blob under backups/');
  }

  const latest = [...blobs].sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
  )[0];

  console.log(`[restore] using latest backup: ${latest.pathname} (${latest.uploadedAt})`);

  const response = await fetch(latest.url);
  if (!response.ok) {
    throw new Error(`Failed to download backup: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function restoreToDatabase(sql, targetDatabaseUrlRaw) {
  const targetDatabaseUrl = stripPrismaOnlyUrlParams(targetDatabaseUrlRaw);
  return new Promise((resolve, reject) => {
    const psql = spawn('psql', [targetDatabaseUrl], { stdio: ['pipe', 'inherit', 'inherit'] });
    psql.on('error', reject);
    psql.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`psql exited with code ${code}`))));
    psql.stdin.write(sql);
    psql.stdin.end();
  });
}

async function main() {
  const targetDatabaseUrl = requireEnv('RESTORE_TARGET_DATABASE_URL');
  const backupSecret = requireEnv('BACKUP_ENCRYPTION_KEY');

  const filePathArg = process.argv.find((arg) => arg.startsWith('--file='));

  let encrypted;
  if (filePathArg) {
    const filePath = filePathArg.split('=')[1];
    console.log(`[restore] reading local backup file: ${filePath}`);
    encrypted = await readFile(filePath);
  } else {
    const blobToken = requireEnv('BLOB_READ_WRITE_TOKEN');
    encrypted = await fetchLatestBackup(blobToken);
  }

  console.log('[restore] decrypting...');
  const compressed = decryptBuffer(encrypted, backupSecret);
  console.log('[restore] decompressing...');
  const sql = await gunzipBuffer(compressed);
  console.log(`[restore] restoring ${sql.length} bytes of SQL into target database...`);
  await restoreToDatabase(sql.toString('utf8'), targetDatabaseUrl);
  console.log('[restore] done.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[restore] FAILED:', error);
    process.exitCode = 1;
  });
}
