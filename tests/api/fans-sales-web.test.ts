import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getFans, POST as postFan } from '@/app/api/fans/route';
import { GET as getSales, POST as postSale } from '@/app/api/sales/route';
import { createTestUser, deleteTestUser, authHeaders, jsonRequest } from '../helpers/fixtures';

// Web equivalent of the Telegram /fan, /fans, /sale, /revenue commands.

const FANS_URL = 'http://localhost:3000/api/fans';
const SALES_URL = 'http://localhost:3000/api/sales';

function getRequest(url: string, token: string) {
  return new NextRequest(url, { headers: authHeaders(token) });
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('GET/POST /api/fans', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await getFans(new NextRequest(FANS_URL));
    expect(response.status).toBe(401);
  });

  it('adds a fan and lists it, with a correct count', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const addResponse = await postFan(jsonRequest(FANS_URL, { email: 'fan@example.com', name: 'Jan' }, authHeaders(token)));
    expect(addResponse.status).toBe(200);

    const listResponse = await getFans(getRequest(FANS_URL, token));
    const body = await listResponse.json();
    expect(body.count).toBe(1);
    expect(body.fans[0].email).toBe('fan@example.com');
  });

  it('rejects an invalid email', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await postFan(jsonRequest(FANS_URL, { email: 'not-an-email' }, authHeaders(token)));
    expect(response.status).toBe(400);
  });
});

describe('GET/POST /api/sales', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await getSales(new NextRequest(SALES_URL));
    expect(response.status).toBe(401);
  });

  it('records a sale and reflects it in the list and revenue summary', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const addResponse = await postSale(jsonRequest(SALES_URL, { product: 'Koszulka', amount: '80' }, authHeaders(token)));
    expect(addResponse.status).toBe(200);

    const listResponse = await getSales(getRequest(SALES_URL, token));
    const body = await listResponse.json();
    expect(body.sales).toHaveLength(1);
    expect(body.sales[0].product).toBe('Koszulka');
    expect(body.summary.allTimeRevenueCents).toBe(8000);
    expect(body.summary.thisMonthRevenueCents).toBe(8000);
  });

  it('rejects a non-positive amount', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await postSale(jsonRequest(SALES_URL, { product: 'Koszulka', amount: '0' }, authHeaders(token)));
    expect(response.status).toBe(400);
  });

  it('rejects an empty product name', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await postSale(jsonRequest(SALES_URL, { product: '  ', amount: '50' }, authHeaders(token)));
    expect(response.status).toBe(400);
  });

  it('a sale with a fanEmail also creates/attaches the fan', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    await postSale(jsonRequest(SALES_URL, { product: 'Koszulka', amount: '80', fanEmail: 'buyer@example.com' }, authHeaders(token)));

    const fansResponse = await getFans(getRequest(FANS_URL, token));
    const fansBody = await fansResponse.json();
    expect(fansBody.count).toBe(1);
    expect(fansBody.fans[0].email).toBe('buyer@example.com');
  });
});
