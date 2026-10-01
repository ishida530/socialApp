import { ServerSessionBoundary } from '@/contexts/auth-context';
import { requireServerSession } from '@/lib/server/session';

// Shared layout for every authenticated section (2026-10-01, performance phase 2):
//   - checks the session on the server and redirects logged-out visitors with a real 307 - in the
//     layout, i.e. before any loading.tsx boundary could stream a skeleton first;
//   - hands the verified user to the client (ServerSessionBoundary) so pages don't wait for
//     /api/auth/me before loading their data.
// Per-user, so every segment using it is dynamic and never cached.
export async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireServerSession();
  return <ServerSessionBoundary user={user}>{children}</ServerSessionBoundary>;
}
