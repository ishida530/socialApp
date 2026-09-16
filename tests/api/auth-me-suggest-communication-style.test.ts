import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockSuggestCommunicationStyle = vi.fn();

vi.mock('@/lib/server/communication-style', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/communication-style')>();
  return { ...actual, suggestCommunicationStyle: mockSuggestCommunicationStyle };
});

const { POST } = await import('@/app/api/auth/me/suggest-communication-style/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser, authHeaders } = await import('../helpers/fixtures');

const URL = 'http://localhost:3000/api/auth/me/suggest-communication-style';

function postRequest(token: string, body: unknown) {
  return new NextRequest(URL, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  mockSuggestCommunicationStyle.mockReset();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('POST /api/auth/me/suggest-communication-style', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: 'bez lania wody' }),
      }),
    );
    expect(response.status).toBe(401);
    expect(mockSuggestCommunicationStyle).not.toHaveBeenCalled();
  });

  it('rejects a draft over the length limit', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await POST(postRequest(token, { draft: 'x'.repeat(501) }));
    expect(response.status).toBe(400);
    expect(mockSuggestCommunicationStyle).not.toHaveBeenCalled();
  });

  it('rejects a non-string draft', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;

    const response = await POST(postRequest(token, { draft: 123 }));
    expect(response.status).toBe(400);
    expect(mockSuggestCommunicationStyle).not.toHaveBeenCalled();
  });

  it('passes the draft and the account businessDescription to suggestCommunicationStyle, and returns its result', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { businessDescription: 'Jestem raperem' } });
    mockSuggestCommunicationStyle.mockResolvedValue('Pisz bezpośrednio, bez lania wody.');

    const response = await POST(postRequest(token, { draft: 'bez lania wody' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestion).toBe('Pisz bezpośrednio, bez lania wody.');
    expect(mockSuggestCommunicationStyle).toHaveBeenCalledWith('bez lania wody', 'Jestem raperem');
  });

  it('treats a missing draft as null rather than failing validation', async () => {
    const { user, token } = await createTestUser();
    cleanupUserId = user.id;
    mockSuggestCommunicationStyle.mockResolvedValue('Napisz kilka słów...');

    const response = await POST(postRequest(token, {}));
    expect(response.status).toBe(200);
    expect(mockSuggestCommunicationStyle).toHaveBeenCalledWith(null, null);
  });
});
