import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/telegram/link-code/route';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, authHeaders, jsonRequest } from '../helpers/fixtures';

const LINK_CODE_URL = 'http://localhost:3000/api/telegram/link-code';

function getRequest(headers: Record<string, string> = {}) {
  return new NextRequest(LINK_CODE_URL, { method: 'GET', headers });
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('GET/POST /api/telegram/link-code', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await POST(jsonRequest(LINK_CODE_URL, {}));
    expect(response.status).toBe(401);
  });

  it('generates a code, persists a hashed TelegramLinkCode, and reports linked=false beforehand', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const statusBefore = await GET(getRequest(authHeaders(token)));
    expect((await statusBefore.json()).linked).toBe(false);

    const response = await POST(jsonRequest(LINK_CODE_URL, {}, authHeaders(token)));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.code).toMatch(/^[A-Z0-9]{8}$/);

    const stored = await prisma.telegramLinkCode.findFirst({ where: { userId: user.id } });
    expect(stored).not.toBeNull();
    expect(stored?.codeHash).not.toBe(body.code);
    expect(stored?.usedAt).toBeNull();
  });

  it('invalidates the previous unused code when a new one is generated', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const first = await POST(jsonRequest(LINK_CODE_URL, {}, authHeaders(token)));
    const firstBody = await first.json();

    const second = await POST(jsonRequest(LINK_CODE_URL, {}, authHeaders(token)));
    const secondBody = await second.json();

    expect(firstBody.code).not.toBe(secondBody.code);

    const codes = await prisma.telegramLinkCode.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(codes).toHaveLength(2);
    expect(codes[0].expiresAt.getTime()).toBeLessThan(Date.now());
  });
});
