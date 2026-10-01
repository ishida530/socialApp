import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/server/session';

// The session gate lives in the layout, not the page (2026-10-01): loading.tsx wraps the PAGE in a
// Suspense boundary, so a redirect thrown from the page happens after the skeleton has already
// streamed (HTTP 200 + client-side redirect). The layout renders before that boundary, so a
// logged-out visitor gets a real server redirect (307) to /login with no skeleton flash.
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!(await getServerSession())) {
    redirect('/login');
  }

  return children;
}
