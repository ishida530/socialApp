import { ServerSessionBoundary } from '@/contexts/auth-context';
import { requireServerSession } from '@/lib/server/session';
import { prefetchApi } from '@/lib/server/api-prefetch';
import { ApiCacheSeed } from '@/components/ApiCacheSeed';

// Shared layout for every authenticated section (2026-10-01, performance phase 2):
//   - checks the session on the server and redirects logged-out visitors with a real 307 - in the
//     layout, i.e. before any loading.tsx boundary could stream a skeleton first (the edge
//     middleware already redirects most of them earlier; this is the second line);
//   - hands the verified user to the client (ServerSessionBoundary) so pages don't wait for
//     /api/auth/me before loading their data;
//   - prefetches the section's mount-time GET endpoints on the server and seeds the client cache
//     (ApiCacheSeed), so those first requests never leave the browser.
// Per-user, so every segment using it is dynamic and never cached.

// The sidebar's plan/usage card - on every authenticated page.
// + what this user can use right now (platform reviews, comments) - read by several panels.
const ALWAYS_PREFETCH = ['/billing/subscription', '/features'];

export async function AuthenticatedLayout({
  children,
  prefetch = [],
}: {
  children: React.ReactNode;
  prefetch?: string[];
}) {
  const user = await requireServerSession();
  const entries = await prefetchApi([...ALWAYS_PREFETCH, ...prefetch]);

  return (
    <ServerSessionBoundary user={user}>
      <ApiCacheSeed entries={entries} />
      {children}
    </ServerSessionBoundary>
  );
}
