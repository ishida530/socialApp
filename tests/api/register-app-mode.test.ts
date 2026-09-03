import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/auth/register/route';
import { prisma } from '@/lib/server/prisma';
import { jsonRequest } from '../helpers/fixtures';

// Regression / behavior coverage for the personal-mode registration lock: a
// self-hosted "personal" deployment (APP_MODE=personal, the default) allows exactly
// one registered user; once one exists, further registrations are rejected. A
// "commercial" deployment has no such limit.

const REGISTER_URL = 'http://localhost:3000/api/auth/register';
const originalAppMode = process.env.APP_MODE;

function registerRequest(email: string, ip: string) {
  return jsonRequest(
    REGISTER_URL,
    { email, name: 'Test User', password: 'TestPass123!' },
    { 'x-forwarded-for': ip },
  );
}

const createdUserIds: string[] = [];

afterEach(async () => {
  process.env.APP_MODE = originalAppMode;
  for (const id of createdUserIds.splice(0)) {
    await prisma.user.delete({ where: { id } }).catch(() => {});
  }
});

describe('POST /api/auth/register app-mode gating', () => {
  it('personal mode: allows exactly one registration, then blocks further ones', async () => {
    process.env.APP_MODE = 'personal';
    const ip = `10.0.0.${Math.floor(Math.random() * 200) + 1}`;

    const beforeCount = await prisma.user.count();
    expect(beforeCount).toBe(0);

    const first = await POST(registerRequest('personal-mode-1@example.com', ip));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    createdUserIds.push(firstBody.user.userId);

    const afterFirstCount = await prisma.user.count();
    expect(afterFirstCount).toBe(1);

    const second = await POST(registerRequest('personal-mode-2@example.com', ip));
    expect(second.status).toBe(400);
    const secondBody = await second.json();
    expect(secondBody.message).toMatch(/Rejestracja jest zamknięta w trybie personal/);

    const afterSecondCount = await prisma.user.count();
    expect(afterSecondCount).toBe(1);
  });

  it('commercial mode: registration is not limited to one user', async () => {
    process.env.APP_MODE = 'commercial';
    const ip = `10.0.0.${Math.floor(Math.random() * 200) + 1}`;

    const beforeCount = await prisma.user.count();

    const first = await POST(registerRequest('commercial-mode-1@example.com', ip));
    expect(first.status).toBe(200);
    createdUserIds.push((await first.json()).user.userId);

    const second = await POST(registerRequest('commercial-mode-2@example.com', ip));
    expect(second.status).toBe(200);
    createdUserIds.push((await second.json()).user.userId);

    const afterCount = await prisma.user.count();
    expect(afterCount).toBe(beforeCount + 2);
  });
});
