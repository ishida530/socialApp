// Proactive content suggestions (2026-09-14): the missing "CO" (what) half of the autopilot
// story - Sprint 11.3 already closed "KIEDY" (when) via data-driven scheduling. Explicitly scoped
// by the product owner: the agent may propose a full, ready-to-publish TEXT post (Facebook is the
// only one of the four platforms whose API accepts a plain status update with no attached media),
// or a content IDEA for platforms that need real media - it never generates images/video itself,
// the owner always supplies those. Either way, nothing publishes without the owner's own tap -
// "sam wymysla, ale za moja zgoda" (comes up with it itself, but with my consent).
import { callClaudeTool, CLAUDE_MODELS } from './anthropic-client';
import { PLATFORM_ALGORITHM_KNOWLEDGE } from './platform-knowledge';
import type { WeeklyCoachingData } from './coaching';

const SUGGEST_TEXT_POST_SYSTEM_PROMPT = [
  'Piszesz GOTOWY do publikacji krótki post na Facebooka w imieniu właściciela konta, po polsku - nie pomysł, nie szkic, gotowa treść którą można od razu opublikować.',
  'Dopasuj ton do opisu konta (jeśli podany) - naturalny, ludzki, nigdy korporacyjny czy szablonowy.',
  'Bazuj WYŁĄCZNIE na podanych danych (aktywność, zaangażowanie, wzrost, cele) - nigdy nie zmyślaj liczb ani wydarzeń, których nie ma w danych.',
  'Post MUSI kończyć się naturalnym pytaniem albo zaproszeniem do podzielenia się opinią/doświadczeniem, szczerze związanym z treścią posta - komentarze to jeden z najsilniejszych sygnałów dla algorytmu Facebooka, więc realna dyskusja pod postem ma znaczenie.',
  'NIE używaj mechanicznych sztuczek typu "oznacz znajomego", "napisz TAK jeśli...", "udostępnij jeśli się zgadzasz" - to jest jawny "engagement bait", Facebook aktywnie obniża za to zasięg. Pytanie ma być szczere, nie mechaniczna sztuczka.',
  'Długość: około 40-80 słów - krótki, konkretny post radzi sobie lepiej niż ściana tekstu.',
  'Jeśli w danych naprawdę nie ma nic sensownego do napisania (zero aktywności, zero celów, zero realnego kontekstu) - ustaw canSuggest na false zamiast zmyślać treść.',
  PLATFORM_ALGORITHM_KNOWLEDGE,
].join(' ');

type TextPostToolResult = { canSuggest?: boolean; postText?: string };

export async function generateFacebookTextPostSuggestion(
  businessDescription: string | null,
  data: WeeklyCoachingData,
): Promise<string | null> {
  const userContent = JSON.stringify({
    accountContext: (businessDescription || '').trim(),
    postsThisWeek: data.postsThisWeek,
    postsLastWeek: data.postsLastWeek,
    engagementRateThisWeek: data.engagementRateThisWeek,
    newFansThisWeek: data.newFansThisWeek,
    activeGoals: data.activeGoals,
    followerGrowth: data.followerGrowth,
  });

  const result = await callClaudeTool<TextPostToolResult>({
    model: CLAUDE_MODELS.contentGeneration,
    system: SUGGEST_TEXT_POST_SYSTEM_PROMPT,
    userContent,
    tool: {
      name: 'suggest_facebook_text_post',
      description: 'Propose a ready-to-publish Facebook text post that invites genuine comments, or decline if there is nothing real to say.',
      input_schema: {
        type: 'object',
        properties: {
          canSuggest: { type: 'boolean' },
          postText: { type: 'string' },
        },
        required: ['canSuggest'],
      },
    },
    maxTokens: 400,
    timeoutMs: 15000,
  });

  if (!result?.canSuggest || !result.postText?.trim()) {
    return null;
  }

  return result.postText.trim();
}
