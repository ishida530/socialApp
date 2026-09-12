import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/telegram/webhook/route';
import { prisma } from '@/lib/server/prisma';
import { createTelegramLinkCode } from '@/lib/server/telegram';
import { createTestUser, deleteTestUser } from '../helpers/fixtures';

// TASK-3.1.1: mechanizm łączenia konta Telegram. Sekcja 4.1/9.3 głównego planu: webhook musi
// weryfikować podpis PRZED jakimkolwiek przetwarzaniem, a wiadomość bez powiązania konta ma
// być odrzucona, nigdy pokazywać niczyich danych.

const WEBHOOK_URL = 'http://localhost:3000/api/telegram/webhook';
const VALID_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET as string;

function webhookRequest(body: unknown, secret: string | null = VALID_SECRET) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret !== null) {
    headers['x-telegram-bot-api-secret-token'] = secret;
  }
  return new NextRequest(WEBHOOK_URL, { method: 'POST', headers, body: JSON.stringify(body) });
}

let cleanupUserId: string | null = null;
let fetchMock: ReturnType<typeof vi.fn>;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('POST /api/telegram/webhook', () => {
  it('rejects a request with a missing/invalid secret header, with zero effect on the database', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const { code } = await createTelegramLinkCode(user.id);

    const response = await POST(webhookRequest({ message: { chat: { id: 111 }, text: `/start ${code}` } }, 'wrong-secret'));
    expect(response.status).toBe(401);

    const response2 = await POST(webhookRequest({ message: { chat: { id: 111 }, text: `/start ${code}` } }, null));
    expect(response2.status).toBe(401);

    const unchanged = await prisma.user.findUnique({ where: { id: user.id } });
    expect(unchanged?.telegramChatId).toBeNull();
  });

  it('links telegramChatId to the user on a valid /start <code>, marks the code used, and sends a confirmation', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const { code } = await createTelegramLinkCode(user.id);

    fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(webhookRequest({ message: { chat: { id: 555444333 }, text: `/start ${code}` } }));
    expect(response.status).toBe(200);

    const linkedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(linkedUser?.telegramChatId).toBe('555444333');

    const usedCode = await prisma.telegramLinkCode.findFirst({ where: { userId: user.id } });
    expect(usedCode?.usedAt).not.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(calledUrl).toContain('api.telegram.org');
    expect(calledUrl).toContain('/sendMessage');
    const sentBody = JSON.parse(calledInit.body);
    expect(sentBody.chat_id).toBe('555444333');
    expect(sentBody.text).toContain('połączone');
  });

  it('does not link on an expired/invalid code, and does not touch the database', async () => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      webhookRequest({ message: { chat: { id: 999 }, text: '/start NOTAREALCODE' } }),
    );
    expect(response.status).toBe(200);

    const linkedUser = await prisma.user.findUnique({ where: { telegramChatId: '999' } });
    expect(linkedUser).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, calledInit] = fetchMock.mock.calls[0] as [string, { body: string }];
    const sentBody = JSON.parse(calledInit.body);
    expect(sentBody.text).toMatch(/nieprawidłow|wygas/);
  });

  it('rejects (with an explanatory reply, never exposing data) a message from an unlinked chat', async () => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      webhookRequest({ message: { chat: { id: 424242 }, text: '/status' } }),
    );
    expect(response.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, calledInit] = fetchMock.mock.calls[0] as [string, { body: string }];
    const sentBody = JSON.parse(calledInit.body);
    expect(sentBody.chat_id).toBe('424242');
    expect(sentBody.text).toMatch(/nie jest jeszcze połączone/);
  });
});
