import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// EPIC 8 TASK-8.3 (Agent kosztow/FinOps, 2026-09-15): /koszty on Telegram - admin-only, since
// Claude cost is app-wide, not per-user.

const mockSendTelegramMessage = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/telegram')>();
  return { ...actual, sendTelegramMessage: mockSendTelegramMessage };
});

const { POST } = await import('@/app/api/telegram/webhook/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTelegramLinkCode } = await import('@/lib/server/telegram');
const { recordClaudeUsage } = await import('@/lib/server/claude-usage');
const { createTestUser, deleteTestUser } = await import('../helpers/fixtures');

const WEBHOOK_URL = 'http://localhost:3000/api/telegram/webhook';
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET as string;
const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

function webhookRequest(body: unknown) {
  return new NextRequest(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
    body: JSON.stringify(body),
  });
}

async function linkChat(userId: string, chatId: string) {
  const { code } = await createTelegramLinkCode(userId);
  await prisma.user.update({ where: { id: userId }, data: { telegramChatId: chatId } });
  return code;
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  mockSendTelegramMessage.mockClear();
  // Deliberately NOT clearing ClaudeUsageLog here - it's a GLOBAL table (see
  // lib/server/claude-usage.ts) shared across parallel test-file workers hitting the same test
  // database; an unscoped deleteMany() would race with other files' concurrent assertions. This
  // file's own assertions only check substring-contains and call counts, never exact global
  // totals, so leftover rows from this or other tests are harmless.
  if (ORIGINAL_ADMIN_EMAILS === undefined) {
    delete process.env.ADMIN_EMAILS;
  } else {
    process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
  }
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('/koszty', () => {
  it('shows the cost summary to an admin email', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    process.env.ADMIN_EMAILS = user.email;
    const chatId = '990001';
    await linkChat(user.id, chatId);
    await recordClaudeUsage('coaching', 'claude-sonnet-5', 1000, 500);

    const response = await POST(webhookRequest({ message: { chat: { id: Number(chatId) }, text: '/koszty' } }));
    expect(response.status).toBe(200);

    expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTelegramMessage.mock.calls[0][1]).toContain('Koszt Claude');
    expect(mockSendTelegramMessage.mock.calls[0][1]).toContain('coaching');
  });

  it('silently does nothing for a non-admin account', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    process.env.ADMIN_EMAILS = 'someone-else@example.com';
    const chatId = '990002';
    await linkChat(user.id, chatId);

    const response = await POST(webhookRequest({ message: { chat: { id: Number(chatId) }, text: '/koszty' } }));
    expect(response.status).toBe(200);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });
});
