import { afterEach, describe, expect, it } from 'vitest';
import { getRecentAuditLogs, recordAuditLog } from '@/lib/server/audit-log';
import { createTestUser, deleteTestUser } from '../helpers/fixtures';

// EPIC 1 TASK-1.5.3 / EPIC 9 TASK-9.3 (audit trail, 2026-09-15).

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('recordAuditLog / getRecentAuditLogs', () => {
  it('records an entry and reads it back scoped to the user', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await recordAuditLog({ userId: user.id, actor: 'user', action: 'login.succeeded', ip: '127.0.0.1' });

    const logs = await getRecentAuditLogs({ userId: user.id });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: user.id, actor: 'user', action: 'login.succeeded', ip: '127.0.0.1' });
  });

  it('stores arbitrary metadata', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await recordAuditLog({ userId: user.id, actor: 'user', action: 'login.succeeded', metadata: { via2fa: true } });

    const logs = await getRecentAuditLogs({ userId: user.id });
    expect(logs[0].metadata).toEqual({ via2fa: true });
  });

  it('accepts a null userId for actions with no human behind them', async () => {
    await expect(recordAuditLog({ actor: 'cron', action: 'sweep.completed' })).resolves.toBeUndefined();
  });

  it('caps the returned limit at 200', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await recordAuditLog({ userId: user.id, actor: 'user', action: 'login.succeeded' });

    const logs = await getRecentAuditLogs({ userId: user.id, limit: 10_000 });
    expect(logs.length).toBeLessThanOrEqual(200);
  });
});
