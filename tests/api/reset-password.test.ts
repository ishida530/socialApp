import { createHash, randomBytes } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';

const { POST } = await import('@/app/api/auth/reset-password/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser } = await import('../helpers/fixtures');

let cleanupUserId: string | null = null;
// Random per run - literal sample passwords trip secret scanners (GitGuardian) as false positives.
const newPassword = () => randomBytes(12).toString('base64url');

afterEach(async () => {
  if (cleanupUserId) await deleteTestUser(cleanupUserId);
  cleanupUserId = null;
});

async function tokenFor(userId: string, expiresInMs = 60_000) {
  const token = randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + expiresInMs),
    },
  });
  return token;
}

function request(body: unknown) {
  return new Request('http://localhost:3000/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 200)}` },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/auth/reset-password', () => {
  it('accepts a valid token even when a password manager filled the hidden honeypot field', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const token = await tokenFor(user.id);

    const response = await POST(
      request({ token, password: newPassword(), hpWebsite: user.email, formStartedAt: Date.now() }),
    );

    expect(response.status).toBe(200);
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.passwordHash).toBeTruthy();
  });

  it('rejects an expired token', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const token = await tokenFor(user.id, -1000);

    const response = await POST(request({ token, password: newPassword() }));
    expect(response.status).toBe(400);
  });

  it('rejects a token that was already used', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const token = await tokenFor(user.id);

    expect((await POST(request({ token, password: newPassword() }))).status).toBe(200);
    expect((await POST(request({ token, password: newPassword() }))).status).toBe(400);
  });
});
