// Real coaching (2026-09-14): the mentor agent was reactive (answers when asked) and rule-based
// nudges were narrow (inactivity, sponsorship growth). This adds the missing proactive piece - a
// weekly check-in that looks at what actually happened (posts, engagement, fans, sales, goal
// progress) and gives a short, personalized observation + one concrete suggestion, not just a
// stats dump. Goals themselves are free text (same "let the LLM handle nuance, don't force a
// rigid metric enum" philosophy as User.businessDescription).
import { prisma } from './prisma';
import { callClaudeTool, CLAUDE_MODELS } from './anthropic-client';
import { redactPotentialPii } from './smart-autopilot/safety';
import { PLATFORM_ALGORITHM_KNOWLEDGE } from './platform-knowledge';
import { getFollowerGrowth, type FollowerGrowthEntry } from './account-growth';

export async function setGoal(userId: string, description: string) {
  return prisma.goal.create({ data: { userId, description: description.trim() } });
}

export async function getActiveGoals(userId: string) {
  return prisma.goal.findMany({ where: { userId, achievedAt: null }, orderBy: { createdAt: 'asc' } });
}

export type CompleteGoalResult = { ok: true; goal: { id: string; description: string } } | { ok: false; error: string };

export async function completeGoal(userId: string, goalId: string): Promise<CompleteGoalResult> {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } });
  if (!goal) {
    return { ok: false, error: 'Nie znaleziono celu o tym ID.' };
  }
  if (goal.achievedAt) {
    return { ok: false, error: 'Ten cel jest już oznaczony jako zrobiony.' };
  }

  const updated = await prisma.goal.update({ where: { id: goal.id }, data: { achievedAt: new Date() } });
  return { ok: true, goal: { id: updated.id, description: updated.description } };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type WeeklyCoachingData = {
  postsThisWeek: number;
  postsLastWeek: number;
  engagementRateThisWeek: number | null;
  engagementRateLastWeek: number | null;
  newFansThisWeek: number;
  salesThisWeekCents: number;
  activeGoals: string[];
  // EPIC 11 Sprint 11.1 (2026-09-14): real ACCOUNT-level growth (followers/subscribers), not
  // just per-post engagement - previously the coach could only ever talk about individual posts,
  // never whether the account itself is actually growing.
  followerGrowth: FollowerGrowthEntry[];
};

async function getEngagementRateForWindow(userId: string, start: Date, end: Date): Promise<number | null> {
  const metrics = await prisma.postMetric.findMany({
    where: { publishJob: { video: { userId }, publishedAt: { gte: start, lt: end } } },
    select: { views: true, likes: true, comments: true, shares: true },
  });

  const withViews = metrics.filter((metric) => metric.views && metric.views > 0);
  if (withViews.length === 0) {
    return null;
  }

  const totalEngagement = withViews.reduce((sum, metric) => sum + (metric.likes ?? 0) + (metric.comments ?? 0) + (metric.shares ?? 0), 0);
  const totalViews = withViews.reduce((sum, metric) => sum + (metric.views ?? 0), 0);

  return totalViews > 0 ? totalEngagement / totalViews : null;
}

export async function getWeeklyCoachingData(userId: string): Promise<WeeklyCoachingData> {
  const now = new Date();
  const weekStart = new Date(now.getTime() - WEEK_MS);
  const twoWeeksStart = new Date(now.getTime() - WEEK_MS * 2);

  const [postsThisWeek, postsLastWeek, engagementRateThisWeek, engagementRateLastWeek, newFansThisWeek, salesThisWeek, activeGoals, followerGrowth] =
    await Promise.all([
      prisma.publishJob.count({ where: { status: 'SUCCESS', video: { userId }, publishedAt: { gte: weekStart } } }),
      prisma.publishJob.count({
        where: { status: 'SUCCESS', video: { userId }, publishedAt: { gte: twoWeeksStart, lt: weekStart } },
      }),
      getEngagementRateForWindow(userId, weekStart, now),
      getEngagementRateForWindow(userId, twoWeeksStart, weekStart),
      prisma.fan.count({ where: { userId, createdAt: { gte: weekStart } } }),
      prisma.sale.aggregate({ where: { userId, createdAt: { gte: weekStart } }, _sum: { amountCents: true } }),
      getActiveGoals(userId),
      getFollowerGrowth(userId),
    ]);

  return {
    postsThisWeek,
    postsLastWeek,
    engagementRateThisWeek,
    engagementRateLastWeek,
    newFansThisWeek,
    salesThisWeekCents: salesThisWeek._sum.amountCents ?? 0,
    followerGrowth,
    activeGoals: activeGoals.map((goal) => goal.description),
  };
}

// Nothing to coach about yet - same "never nudge someone who hasn't started" rule as
// sendInactivityNudges, plus: if they set a goal with zero posts ever, there's still something
// to talk about (encouragement toward the goal), so goals count as "something to say" too.
export function hasCoachableActivity(data: WeeklyCoachingData): boolean {
  return data.postsThisWeek > 0 || data.postsLastWeek > 0 || data.activeGoals.length > 0 || data.newFansThisWeek > 0 || data.salesThisWeekCents > 0;
}

const COACH_SYSTEM_PROMPT = [
  'Jestes coachem social media dla tworcy korzystajacego z appki Postfly. Piszesz krotkie, cotygodniowe podsumowanie na Telegramie po polsku.',
  'Ton: wspierajacy, nigdy krytyczny czy oceniajacy - nawet gdy dane pokazuja spadek, potraktuj to neutralnie/konstruktywnie, nie jako porazke.',
  'Struktura: 2-3 zdania podsumowania tego co realnie sie wydarzylo (na podstawie DANYCH, nie zgadywania), potem DOKLADNIE jedna konkretna, wykonalna sugestia na kolejny tydzien.',
  'Jesli brakuje danych do jakiegos porownania (np. brak wczesniejszego tygodnia), pomin to zamiast zmyslac liczby.',
  'Jesli sa aktywne cele uzytkownika, nawiaz do nich wprost - czy widac postep, czy moze warto je dostosowac.',
  'followerGrowth to realny wzrost/spadek liczby obserwujacych/subskrybentow per platforma (nie mylic z engagement per post) - jesli sa dane, wspomnij o tym, bo to pokazuje czy CALE konto rosnie, nie tylko pojedyncze posty. Platforma bez danych (weekAgo null) - pomin ja, nie zgaduj trendu.',
  'Nie uzywaj ogolnikow typu "swietna robota" bez pokrycia w danych - badz konkretny.',
  // 2026-09-16: jeśli podano communicationStyle, to nadrzędna instrukcja co do tonu/słownictwa -
  // ważniejsza niż "wspierający" wyżej, jeśli communicationStyle mówi co innego (np. bardziej
  // bezpośredni/surowy ton).
  'Jesli w danych podano communicationStyle (styl wypowiedzi wlasciciela konta) - trzymaj sie go dosłownie, jest wazniejszy niz ogolne wskazowki tonu w tym prompcie.',
  PLATFORM_ALGORITHM_KNOWLEDGE,
].join(' ');

type CoachToolResult = { summary?: string; suggestion?: string };

export type CoachingMessage = { summary: string; suggestion: string };

export async function generateCoachingMessage(
  data: WeeklyCoachingData,
  businessDescription: string | null,
  communicationStyle?: string | null,
): Promise<CoachingMessage | null> {
  const userContent = JSON.stringify({
    accountContext: redactPotentialPii((businessDescription || '').trim()),
    communicationStyle: redactPotentialPii((communicationStyle || '').trim()),
    postsThisWeek: data.postsThisWeek,
    postsLastWeek: data.postsLastWeek,
    engagementRateThisWeek: data.engagementRateThisWeek,
    engagementRateLastWeek: data.engagementRateLastWeek,
    newFansThisWeek: data.newFansThisWeek,
    salesThisWeekPLN: data.salesThisWeekCents / 100,
    activeGoals: data.activeGoals,
    followerGrowth: data.followerGrowth,
  });

  const result = await callClaudeTool<CoachToolResult>({
    scope: 'coaching',
    model: CLAUDE_MODELS.contentGeneration,
    system: COACH_SYSTEM_PROMPT,
    userContent,
    tool: {
      name: 'weekly_coaching_message',
      description: 'Generate a short, supportive weekly coaching summary and one concrete suggestion.',
      input_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['summary', 'suggestion'],
      },
    },
    maxTokens: 512,
    timeoutMs: 15000,
  });

  if (!result?.summary?.trim() || !result?.suggestion?.trim()) {
    return null;
  }

  return { summary: result.summary.trim(), suggestion: result.suggestion.trim() };
}

// Never silent even without Claude - a plain, honest, data-only version of the same check-in.
export function formatFallbackCoachingMessage(data: WeeklyCoachingData): CoachingMessage {
  const lines = [
    `${data.postsThisWeek} ${data.postsThisWeek === 1 ? 'publikacja' : 'publikacji'} w tym tygodniu (poprzedni tydzień: ${data.postsLastWeek}).`,
  ];

  if (data.newFansThisWeek > 0) {
    lines.push(`+${data.newFansThisWeek} nowych fanów.`);
  }
  if (data.salesThisWeekCents > 0) {
    lines.push(`Sprzedaże w tym tygodniu: ${(data.salesThisWeekCents / 100).toFixed(2)} PLN.`);
  }
  data.followerGrowth.forEach((entry) => {
    if (entry.weekAgo === null) {
      return;
    }
    const delta = entry.current - entry.weekAgo;
    if (delta !== 0) {
      lines.push(`${entry.platform}: ${delta > 0 ? '+' : ''}${delta} obserwujących w tym tygodniu.`);
    }
  });

  return {
    summary: lines.join(' '),
    suggestion: data.activeGoals.length > 0 ? `Aktywny cel: ${data.activeGoals[0]}.` : 'Zapisz cel przez /goal, żebym mógł śledzić postęp razem z Tobą.',
  };
}
