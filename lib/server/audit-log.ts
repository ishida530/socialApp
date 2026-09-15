// EPIC 1 TASK-1.5.3 / EPIC 9 TASK-9.3 (audit trail, 2026-09-15). Best-effort, never allowed to
// fail or block the action being logged - the same posture as every other observability call in
// this app (logError/logEvent).
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { logError } from './observability';

export type AuditActor = 'user' | 'telegram-bot' | 'cron' | 'admin' | 'system';

export async function recordAuditLog(input: {
  userId?: string | null;
  actor: AuditActor;
  action: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        actor: input.actor,
        action: input.action,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    logError('audit-log', 'record-failed', error, { action: input.action });
  }
}

export async function getRecentAuditLogs(params: { userId?: string; limit?: number } = {}) {
  return prisma.auditLog.findMany({
    where: params.userId ? { userId: params.userId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: Math.min(params.limit ?? 50, 200),
  });
}
