import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/account-campaigns/route';
import { POST as endCampaign } from '@/app/api/account-campaigns/end/route';
import { GET as getReport } from '@/app/api/account-campaigns/[id]/report/route';
import { createTestUser, deleteTestUser, authHeaders, jsonRequest } from '../helpers/fixtures';

// Web equivalent of the Telegram /campaign, /campaign-end, /campaigns, /campaign-report commands
// - same lib/server/campaigns.ts functions, distinct route namespace from the pre-existing
// app/api/campaigns/* (an unrelated older feature, see app/api/account-campaigns/route.ts).

const LIST_URL = 'http://localhost:3000/api/account-campaigns';
const END_URL = 'http://localhost:3000/api/account-campaigns/end';

function getRequest(token: string) {
  return new NextRequest(LIST_URL, { headers: authHeaders(token) });
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('GET/POST /api/account-campaigns', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await GET(new NextRequest(LIST_URL));
    expect(response.status).toBe(401);
  });

  it('starts a campaign, lists it, and shows it as active', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const startResponse = await POST(jsonRequest(LIST_URL, { name: 'Premiera EP' }, authHeaders(token)));
    expect(startResponse.status).toBe(200);
    const startBody = await startResponse.json();
    expect(startBody.campaign.name).toBe('Premiera EP');

    const listResponse = await GET(getRequest(token));
    const listBody = await listResponse.json();
    expect(listBody.active.name).toBe('Premiera EP');
    expect(listBody.campaigns).toHaveLength(1);
  });

  it('starting a second campaign auto-ends the first', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    await POST(jsonRequest(LIST_URL, { name: 'Kampania 1' }, authHeaders(token)));
    const secondResponse = await POST(jsonRequest(LIST_URL, { name: 'Kampania 2' }, authHeaders(token)));
    const secondBody = await secondResponse.json();
    expect(secondBody.endedPrevious.name).toBe('Kampania 1');

    const listResponse = await GET(getRequest(token));
    const listBody = await listResponse.json();
    expect(listBody.active.name).toBe('Kampania 2');
  });

  it('rejects starting a campaign with an empty name', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await POST(jsonRequest(LIST_URL, { name: '  ' }, authHeaders(token)));
    expect(response.status).toBe(400);
  });
});

describe('POST /api/account-campaigns/end', () => {
  it('ends the active campaign', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await POST(jsonRequest(LIST_URL, { name: 'Premiera EP' }, authHeaders(token)));

    const response = await endCampaign(jsonRequest(END_URL, {}, authHeaders(token)));
    expect(response.status).toBe(200);

    const listResponse = await GET(getRequest(token));
    const listBody = await listResponse.json();
    expect(listBody.active).toBeNull();
  });

  it('returns 400 when there is no active campaign', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await endCampaign(jsonRequest(END_URL, {}, authHeaders(token)));
    expect(response.status).toBe(400);
  });
});

describe('GET /api/account-campaigns/[id]/report', () => {
  it('returns a real report for an existing campaign by id', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    const startResponse = await POST(jsonRequest(LIST_URL, { name: 'Premiera EP' }, authHeaders(token)));
    const { campaign } = await startResponse.json();

    const response = await getReport(getRequest(token), { params: Promise.resolve({ id: campaign.id }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.report.name).toBe('Premiera EP');
    expect(body.report.postsCount).toBe(0);
  });

  it('returns 404 for a campaign that does not exist', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await getReport(getRequest(token), { params: Promise.resolve({ id: 'nonexistent' }) });
    expect(response.status).toBe(404);
  });
});
