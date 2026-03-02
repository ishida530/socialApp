import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaPool?: Pool;
};

function getPool() {
  if (globalForPrisma.prismaPool) {
    return globalForPrisma.prismaPool;
  }

  const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL or DIRECT_URL for Prisma adapter');
  }

  const pgSslMode = process.env.PGSSLMODE?.toLowerCase();
  const disableTlsVerification =
    pgSslMode === 'no-verify' ||
    process.env.PGSSL_REJECT_UNAUTHORIZED === '0' ||
    process.env.PGSSL_REJECT_UNAUTHORIZED?.toLowerCase() === 'false';

  const pool = new Pool({
    connectionString,
    ssl: disableTlsVerification ? { rejectUnauthorized: false } : undefined,
  });
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prismaPool = pool;
  }

  return pool;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(getPool()),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
