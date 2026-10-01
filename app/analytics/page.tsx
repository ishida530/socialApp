import { AnalyticsView, type AnalyticsResponse } from '@/components/AnalyticsView';
import { requireServerSession } from '@/lib/server/session';
import { getAnalyticsSummary } from '@/lib/server/dashboard-data';

// Server Component (2026-10-01, performance phase 2): the default 30-day view is read from the
// database while rendering; the range switcher stays interactive on the client. Per-user: dynamic.
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const session = await requireServerSession();
  const initialMetrics = await getAnalyticsSummary(session.userId, '30d').catch(() => null);

  return <AnalyticsView initialMetrics={initialMetrics as AnalyticsResponse | null} />;
}
