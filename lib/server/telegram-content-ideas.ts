// /pomysl: originally an on-demand-only Telegram command (every call is a paid Claude request,
// and the product owner's standing constraint is that Claude is the only paid component of this
// app). Proactive content suggestions (2026-09-14) now also call this on a weekly cron sweep, for
// accounts without a usable Facebook text-post path - cost stays bounded the same way every other
// proactive nudge in this app is bounded, by a per-user cooldown field
// (User.lastContentSuggestionSentAt), not by being on-demand-only. Grounded in the user's own
// recent PUBLISHED posts + businessDescription, not generic advice - and NOT based on engagement
// metrics (PostMetric exists now, but "what performs well" is a separate claim; this only looks
// at what was posted, not how it did).
import { callClaudeTool, CLAUDE_MODELS } from './anthropic-client';
import { redactPotentialPii } from './smart-autopilot/safety';
import { PLATFORM_ALGORITHM_KNOWLEDGE } from './platform-knowledge';
import type { RecentContentSample } from './publish-jobs';

const IDEAS_SYSTEM_PROMPT = [
  'Jestes asystentem tworczym pomagajacym wlascicielowi konta social media (opisanego w "accountContext", jesli puste - pisz neutralnie) wymyslic KONKRETNE pomysly na kolejne nagrania, gdy zabraklo mu wlasnych pomyslow.',
  'Dostajesz liste jego OSTATNICH opublikowanych postow (podpisy/hashtagi/tytuly) w "recentPosts" - to jedyne dostepne dane o stylu, NIE masz danych o tym, ktory post zdobyl wiecej wyswietlen czy polubien, wiec nie zgaduj i nie twierdz "to dzialalo najlepiej".',
  'Zaproponuj DOKLADNIE 2-3 pomysly. Kazdy pomysl to konkretny opis sceny/kadru/tresci do nagrania (nie ogolnik typu "nagraj cos ciekawego") - co pokazac, gdzie, jaki ma byc hook/pierwsza sekunda.',
  'Unikaj powtarzania motywow ktore juz widac w "recentPosts" - szukaj wariacji lub czegos nowego w tym samym stylu/branzy.',
  'Pisz po polsku, krotko i konkretnie - to ma byc gotowa podpowiedz do nagrania, nie esej.',
  // 2026-09-16: communicationStyle (jeśli podano) to nadrzędna instrukcja co do słownictwa/tonu
  // opisu pomysłu - ważniejsza niż domyślny neutralny styl.
  'Jesli w danych podano communicationStyle - opisuj pomysly w tym samym tonie/slownictwie, to nadrzedne wobec neutralnego domyslnego stylu.',
  PLATFORM_ALGORITHM_KNOWLEDGE,
].join(' ');

type IdeasToolResult = {
  ideas?: Array<{ title?: string; description?: string }>;
};

export type ContentIdea = { title: string; description: string };

export async function generateContentIdeas(
  businessDescription: string | null,
  recentPosts: RecentContentSample[],
  communicationStyle?: string | null,
): Promise<ContentIdea[] | null> {
  const safeAccountContext = redactPotentialPii((businessDescription || '').trim());
  const safeCommunicationStyle = redactPotentialPii((communicationStyle || '').trim());
  const safeRecentPosts = recentPosts.map((post) => ({
    caption: redactPotentialPii(post.caption || ''),
    hashtags: post.hashtags,
    title: post.title ? redactPotentialPii(post.title) : null,
  }));

  const userContent = JSON.stringify({
    accountContext: safeAccountContext,
    communicationStyle: safeCommunicationStyle,
    recentPosts: safeRecentPosts,
  });

  const result = await callClaudeTool<IdeasToolResult>({
    scope: 'content-ideas',
    model: CLAUDE_MODELS.contentGeneration,
    system: IDEAS_SYSTEM_PROMPT,
    userContent,
    tool: {
      name: 'suggest_content_ideas',
      description: 'Suggest 2-3 concrete, filmable content ideas based on the account style shown in recent posts.',
      input_schema: {
        type: 'object',
        properties: {
          ideas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['title', 'description'],
            },
          },
        },
        required: ['ideas'],
      },
    },
    maxTokens: 1024,
    timeoutMs: 20000,
  });

  if (!result || !Array.isArray(result.ideas) || result.ideas.length === 0) {
    return null;
  }

  const ideas = result.ideas
    .filter((idea): idea is { title: string; description: string } => Boolean(idea.title?.trim() && idea.description?.trim()))
    .slice(0, 3)
    .map((idea) => ({ title: idea.title.trim().slice(0, 100), description: idea.description.trim().slice(0, 500) }));

  return ideas.length > 0 ? ideas : null;
}
