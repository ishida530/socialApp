import { afterEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/auth/register/route';
import { prisma } from '@/lib/server/prisma';
import { currentAppMode } from '../helpers/mode';
import { jsonRequest } from '../helpers/fixtures';

// Regression / behavior coverage for the personal-mode registration lock: a
// self-hosted "personal" deployment (APP_MODE=personal, the default) allows exactly
// one registered user; once one exists, further registrations are rejected. A
// "commercial" deployment has no such limit.
//
// APP_MODE is read from the ambient process env (set externally by test:personal /
// test:commercial), never mutated here — this file runs unmodified under both modes
// as two separate `vitest run` invocations (npm test runs both in sequence).

const REGISTER_URL = 'http://localhost:3000/api/auth/register';

function registerRequest(email: string, ip: string) {
  return jsonRequest(
    REGISTER_URL,
    { email, name: 'Test User', password: 'TestPass123!' },
    { 'x-forwarded-for': ip },
  );
}

const createdUserIds: string[] = [];

afterEach(async () => {
  for (const id of createdUserIds.splice(0)) {
    await prisma.user.delete({ where: { id } }).catch(() => {});
  }
});

describe(`POST /api/auth/register app-mode gating (APP_MODE=${currentAppMode})`, () => {
  it('registration respects the single-user gate correctly for the current APP_MODE', async () => {
    const ip = `10.0.0.${Math.floor(Math.random() * 200) + 1}`;

    const beforeCount = await prisma.user.count();
    expect(beforeCount).toBe(0);

    const first = await POST(registerRequest('app-mode-1@example.com', ip));
    expect(first.status).toBe(200);
    createdUserIds.push((await first.json()).user.userId);

    const afterFirstCount = await prisma.user.count();
    expect(afterFirstCount).toBe(1);

    const second = await POST(registerRequest('app-mode-2@example.com', ip));

    if (currentAppMode === 'personal') {
      expect(second.status).toBe(400);
      const body = await second.json();
      expect(body.message).toMatch(/Rejestracja jest zamknięta w trybie personal/);
      expect(await prisma.user.count()).toBe(1);
    } else {
      expect(second.status).toBe(200);
      createdUserIds.push((await second.json()).user.userId);
      expect(await prisma.user.count()).toBe(2);
    }
  });
});
