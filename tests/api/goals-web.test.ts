import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/goals/route';
import { POST as completeGoal } from '@/app/api/goals/[id]/complete/route';
import { createTestUser, deleteTestUser, authHeaders, jsonRequest } from '../helpers/fixtures';

// Web equivalent of the Telegram /goal, /goals, /goal-done commands.

const URL = 'http://localhost:3000/api/goals';

function getRequest(token: string) {
  return new NextRequest(URL, { headers: authHeaders(token) });
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('GET/POST /api/goals', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await GET(new NextRequest(URL));
    expect(response.status).toBe(401);
  });

  it('creates a goal and lists it', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const createResponse = await POST(jsonRequest(URL, { description: 'Publikować 3x w tygodniu' }, authHeaders(token)));
    expect(createResponse.status).toBe(200);

    const listResponse = await GET(getRequest(token));
    const body = await listResponse.json();
    expect(body.goals).toHaveLength(1);
    expect(body.goals[0].description).toBe('Publikować 3x w tygodniu');
  });

  it('rejects an empty description', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await POST(jsonRequest(URL, { description: '   ' }, authHeaders(token)));
    expect(response.status).toBe(400);
  });

  it('rejects a description over the length limit', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await POST(jsonRequest(URL, { description: 'x'.repeat(301) }, authHeaders(token)));
    expect(response.status).toBe(400);
  });
});

describe('POST /api/goals/[id]/complete', () => {
  it('marks a goal as done, removing it from the active list', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const createResponse = await POST(jsonRequest(URL, { description: 'Cel testowy' }, authHeaders(token)));
    const { goal } = await createResponse.json();

    const response = await completeGoal(jsonRequest(`${URL}/${goal.id}/complete`, {}, authHeaders(token)), {
      params: Promise.resolve({ id: goal.id }),
    });
    expect(response.status).toBe(200);

    const listResponse = await GET(getRequest(token));
    const listBody = await listResponse.json();
    expect(listBody.goals).toHaveLength(0);
  });

  it('returns 400 for a goal that does not belong to the user', async () => {
    const { user: owner, token: ownerToken } = await createTestUser();
    const { user: intruder, token: intruderToken } = await createTestUser();
    cleanupUserId = owner.id;
    const createResponse = await POST(jsonRequest(URL, { description: 'Cel właściciela' }, authHeaders(ownerToken)));
    const { goal } = await createResponse.json();

    const response = await completeGoal(jsonRequest(`${URL}/${goal.id}/complete`, {}, authHeaders(intruderToken)), {
      params: Promise.resolve({ id: goal.id }),
    });
    expect(response.status).toBe(400);

    await deleteTestUser(intruder.id);
  });
});
