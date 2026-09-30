import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

// 2026-09-30: every OAuth callback failure used to collapse into "Nie udało się połączyć konta.
// Spróbuj ponownie." - including the ones a new user can fix themselves (declined consent, no
// Instagram Business account, plan limit). Actionable errors now reach the /callback page;
// anything internal still stays generic.

const { GET } = await import('@/app/api/auth/callback/[provider]/route');

function callback(provider: string, query: string) {
  return GET(new NextRequest(`http://localhost:3000/api/auth/callback/${provider}?${query}`), {
    params: Promise.resolve({ provider }),
  });
}

function redirectMessage(response: Response) {
  const location = response.headers.get('location');
  expect(location).toBeTruthy();
  const url = new URL(location!);
  return { status: url.searchParams.get('status'), message: url.searchParams.get('message') ?? '' };
}

describe('GET /api/auth/callback/[provider] - user-facing errors', () => {
  it('tells the user they cancelled when the provider returns access_denied', async () => {
    const response = await callback('facebook', 'error=access_denied&error_description=Permissions+error');
    const { status, message } = redirectMessage(response);
    expect(status).toBe('error');
    expect(message).toMatch(/Anulowano/);
  });

  it('explains an expired TikTok connection session instead of a generic failure', async () => {
    const response = await callback('tiktok', 'code=abc&state=xyz');
    const { status, message } = redirectMessage(response);
    expect(status).toBe('error');
    expect(message).toMatch(/Sesja łączenia TikToka wygasła/);
  });

  it('keeps internal failures generic (no raw provider/crypto details in the URL)', async () => {
    const response = await callback('facebook', 'code=abc&state=not-a-valid-state');
    const { status, message } = redirectMessage(response);
    expect(status).toBe('error');
    expect(message).toBe('Nie udało się połączyć konta. Spróbuj ponownie.');
  });
});
