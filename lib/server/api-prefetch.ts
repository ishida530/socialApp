import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

// Server-side prefetch of the GET endpoints a page will call on mount (2026-10-01, performance
// phase 2). The section layout runs the SAME route handler in-process with the visitor's own
// cookies, and the client seeds its apiClient cache with the JSON (components/ApiCacheSeed) - so
// the page's existing `apiClient.get(url)` calls resolve instantly, without a network round trip
// and without duplicating any query logic or response shaping outside the API routes.
//
// Only whitelisted, read-only GET handlers that take just the request. A failed prefetch simply
// isn't seeded - the page then fetches on its own, exactly as before.
type GetHandler = (request: NextRequest) => Promise<Response>;

const HANDLERS: Record<string, () => Promise<{ GET: GetHandler }>> = {
  '/billing/subscription': () => import('@/app/api/billing/subscription/route'),
  '/social-accounts': () => import('@/app/api/social-accounts/route'),
  '/activity': () => import('@/app/api/activity/route'),
  '/jobs': () => import('@/app/api/jobs/route'),
  '/videos': () => import('@/app/api/videos/route'),
  '/fans': () => import('@/app/api/fans/route'),
  '/sales': () => import('@/app/api/sales/route'),
  '/comments': () => import('@/app/api/comments/route'),
  '/account-campaigns': () => import('@/app/api/account-campaigns/route'),
  '/features': () => import('@/app/api/features/route'),
};

export type PrefetchedApiEntry = { url: string; data: unknown };

export async function prefetchApi(urls: string[]): Promise<PrefetchedApiEntry[]> {
  const cookieHeader = (await cookies())
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join('; ');

  const results = await Promise.all(
    urls.map(async (url): Promise<PrefetchedApiEntry | null> => {
      const loadHandler = HANDLERS[url.split('?')[0]];
      if (!loadHandler) {
        return null;
      }

      try {
        const { GET } = await loadHandler();
        const response = await GET(
          new NextRequest(new URL(`/api${url}`, 'http://postfly.internal'), { headers: { cookie: cookieHeader } }),
        );
        if (!response.ok) {
          return null;
        }
        return { url, data: await response.json() };
      } catch {
        return null;
      }
    }),
  );

  return results.filter((entry): entry is PrefetchedApiEntry => entry !== null);
}
