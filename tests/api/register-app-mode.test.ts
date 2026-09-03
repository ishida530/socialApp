import { randomUUID } from 'node:crypto';
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
//
// This runs against a real, shared local dev database that a human may also be using
// (e.g. to manually try the app in a browser) — it must not assume the User table starts
// empty, and must never delete a row it didn't create itself.

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
    const emailA = `app-mode-${randomUUID()}@example.com`;
    const emailB = `app-mode-${randomUUID()}@example.com`;

    const beforeCount = await prisma.user.count();
    const first = await POST(registerRequest(emailA, ip));

    if (currentAppMode === 'personal' && beforeCount >= 1) {
      // A user already exists (e.g. from someone manually trying the app locally) —
      // personal mode's gate fires on the very first attempt, so there's nothing further
      // to exercise here beyond confirming that block.
      expect(first.status).toBe(400);
      const body = await first.json();
      expect(body.message).toMatch(/Rejestracja jest zamknięta w trybie personal/);
      expect(await prisma.user.count()).toBe(beforeCount);
      return;
    }

    expect(first.status).toBe(200);
    createdUserIds.push((await first.json()).user.userId);
    expect(await prisma.user.count()).toBe(beforeCount + 1);

    const second = await POST(registerRequest(emailB, ip));

    if (currentAppMode === 'personal') {
      expect(second.status).toBe(400);
      const body = await second.json();
      expect(body.message).toMatch(/Rejestracja jest zamknięta w trybie personal/);
      expect(await prisma.user.count()).toBe(beforeCount + 1);
    } else {
      expect(second.status).toBe(200);
      createdUserIds.push((await second.json()).user.userId);
      expect(await prisma.user.count()).toBe(beforeCount + 2);
    }
  });
});
