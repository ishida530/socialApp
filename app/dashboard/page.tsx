import { Dashboard } from '@/components/Dashboard';
import { requireServerSession } from '@/lib/server/session';
import { getAnalyticsSummary, getOnboardingProgress } from '@/lib/server/dashboard-data';

// Server Component (2026-10-01, performance phase 2). Before: a client page that rendered
// "Ładowanie sesji...", waited for /api/auth/me, then fired ~9 API calls. Now the session is checked
// and the analytics totals + onboarding progress are read from the database while the HTML is
// rendered, next to the DB (cdg1); the interactive panels (AI advisor, accounts, activity) still
// load on the client, but start immediately instead of after the session round trip.
// Per-user data: always dynamic, never cached/ISR.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // The layout already redirected logged-out visitors; this only reads the (verified) user.
  const session = await requireServerSession();

  const [analytics, onboarding] = await Promise.all([
    // On a DB hiccup pass undefined, so the client falls back to fetching on its own.
    getAnalyticsSummary(session.userId, '30d').catch(() => undefined),
    getOnboardingProgress(session.userId).catch(() => undefined),
  ]);

  return <Dashboard initialAnalytics={analytics} initialOnboarding={onboarding} />;
}
