import { GrowthPanel, type FollowerGrowthEntry, type Goal } from '@/components/GrowthPanel';
import { requireServerSession } from '@/lib/server/session';
import { getActiveGoals } from '@/lib/server/coaching';
import { getFollowerGrowth } from '@/lib/server/account-growth';

// Server Component (2026-10-01, performance phase 2): goals and follower growth are read from the
// database while rendering (same functions as GET /api/goals and /api/growth). Per-user: dynamic.
export const dynamic = 'force-dynamic';

export default async function GrowthPage() {
  const session = await requireServerSession();
  const initialData = await Promise.all([getActiveGoals(session.userId), getFollowerGrowth(session.userId)])
    // JSON round trip: exactly the shape the API returns (dates as ISO strings).
    .then(([goals, growth]) => JSON.parse(JSON.stringify({ goals, growth })) as { goals: Goal[]; growth: FollowerGrowthEntry[] })
    .catch(() => undefined);

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Rozwój konta</h1>
      <GrowthPanel initialData={initialData} />
    </main>
  );
}
