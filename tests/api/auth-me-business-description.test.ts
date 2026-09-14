import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from '@/app/api/auth/me/route';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, authHeaders } from '../helpers/fixtures';

const URL = 'http://localhost:3000/api/auth/me';

function getRequest(token: string) {
  return new NextRequest(URL, { headers: authHeaders(token) });
}

function patchRequest(token: string, body: unknown) {
  return new NextRequest(URL, {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('GET/PATCH /api/auth/me — businessDescription', () => {
  it('GET returns null businessDescription for a fresh account', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await GET(getRequest(token));
    const body = await response.json();
    expect(body.businessDescription).toBeNull();
  });

  it('PATCH saves a businessDescription and GET reflects it afterwards', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await PATCH(
      patchRequest(token, { businessDescription: 'Prowadzę salon kosmetyczny w Warszawie' }),
    );
    expect(response.status).toBe(200);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.businessDescription).toBe('Prowadzę salon kosmetyczny w Warszawie');

    const getResponse = await GET(getRequest(token));
    const getBody = await getResponse.json();
    expect(getBody.businessDescription).toBe('Prowadzę salon kosmetyczny w Warszawie');
  });

  it('PATCH with an empty string clears businessDescription back to null', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { businessDescription: 'coś tam' } });

    await PATCH(patchRequest(token, { businessDescription: '   ' }));

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.businessDescription).toBeNull();
  });

  it('PATCH rejects a businessDescription over the length limit', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await PATCH(patchRequest(token, { businessDescription: 'x'.repeat(501) }));
    expect(response.status).toBe(400);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.businessDescription).toBeNull();
  });

  it('PATCH with defaultExplicitContent alone does not touch businessDescription', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { businessDescription: 'wcześniej ustawione' } });

    const response = await PATCH(patchRequest(token, { defaultExplicitContent: true }));
    expect(response.status).toBe(200);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.businessDescription).toBe('wcześniej ustawione');
    expect(refreshed.defaultExplicitContent).toBe(true);
  });
});

// Web equivalent of Telegram's /autopilot on|off|status (2026-09-14) - the same
// User.autopilotEnabled field, exposed here so the Account settings page can toggle it too.
describe('GET/PATCH /api/auth/me — autopilotEnabled', () => {
  it('GET returns false for a fresh account', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await GET(getRequest(token));
    const body = await response.json();
    expect(body.autopilotEnabled).toBe(false);
  });

  it('PATCH toggles autopilotEnabled and GET reflects it afterwards', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await PATCH(patchRequest(token, { autopilotEnabled: true }));
    expect(response.status).toBe(200);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.autopilotEnabled).toBe(true);

    const getResponse = await GET(getRequest(token));
    const getBody = await getResponse.json();
    expect(getBody.autopilotEnabled).toBe(true);
  });

  it('PATCH rejects a non-boolean autopilotEnabled', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await PATCH(patchRequest(token, { autopilotEnabled: 'yes' }));
    expect(response.status).toBe(400);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.autopilotEnabled).toBe(false);
  });
});
