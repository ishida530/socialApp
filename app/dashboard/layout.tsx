import { AuthenticatedLayout } from '@/components/server/AuthenticatedLayout';

// Session checked on the server for this section, and its mount-time API calls prefetched -
// see AuthenticatedLayout. The URLs must match the page's apiClient.get(...) calls exactly.
export const dynamic = 'force-dynamic';

const PREFETCH: string[] = ['/social-accounts', '/activity?limit=8&offset=0', '/jobs?limit=50&offset=0', '/videos?status=READY'];

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedLayout prefetch={PREFETCH}>{children}</AuthenticatedLayout>;
}
