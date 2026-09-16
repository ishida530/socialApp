// 2026-09-16 (zgłoszenie właściciela: sugerowana treść brzmiała "pizdowato", zbyt generycznie-
// motywacyjnie) - "Zaproponuj (AI)" na polu Styl wypowiedzi. Świadomie NIE wywołuje Claude, kiedy
// użytkownik nie napisał jeszcze nic - AI nie ma z czego wywnioskować czyjś prawdziwy głos, a
// zgadywanie od zera byłoby dokładnie tym samym grzechem pierworodnym, który spowodował zgłoszenie
// (appka wymyśla generyczny ton zamiast pytać). Zamiast tego zwraca gotowy zestaw pytań
// pomagających zacząć pisać. Kiedy jest szkic - Claude go dopracowuje/strukturyzuje, nie wymyśla
// od zera.
import { callClaudeTool, CLAUDE_MODELS } from './anthropic-client';
import { redactPotentialPii } from './smart-autopilot/safety';

export const COMMUNICATION_STYLE_STARTER_TEMPLATE =
  'Napisz kilka słów, a ja to dopracuję. Pomocne pytania: Jak zwracasz się do odbiorców (Wy/ziomy/imiennie)? ' +
  'Krótko i konkretnie, czy swobodnie i z dygresjami? Jakich słów/fraz na pewno NIE chcesz widzieć (np. "buduję markę", ' +
  '"świetna robota")? Używasz jakiegoś charakterystycznego slangu albo zwrotów?';

const REFINE_STYLE_SYSTEM_PROMPT = [
  'Pomagasz dopracować krótki opis stylu/tonu wypowiedzi właściciela konta social media - ten opis będzie używany jako STAŁA instrukcja we wszystkich przyszłych promptach generujących dla niego treść (podpisy pod postami, sugestie postów, odpowiedzi na komentarze).',
  'Dostajesz surowy, często niedopracowany szkic od użytkownika w polu "draft" i opcjonalnie kontekst konta w polu "accountContext".',
  'Przekształć szkic w zwięzły, KONKRETNY i możliwy do bezpośredniego zastosowania opis (maksymalnie 3-4 zdania) - unikaj banałów typu "autentyczny, ludzki ton, bliski odbiorcom". Bądź konkretny: jakich słów/fraz używać albo unikać, jaki poziom formalności, czy zadawać pytania na końcu, jak się zwracać do odbiorców.',
  'Zachowaj SENS i charakter tego, co napisał użytkownik - dopracuj i ustrukturyzuj jego własne słowa, nie wymyślaj nowego stylu od zera i nie dodawaj cech, o których nie wspomniał.',
  'Pisz po polsku, w drugiej osobie liczby pojedynczej, jakby to była bezpośrednia instrukcja dla kogoś piszącego w jego imieniu (np. "Pisz bezpośrednio, bez lania wody...").',
].join(' ');

type StyleToolResult = { styleDescription?: string };

// Draft present -> Claude refines it. Draft empty/whitespace-only -> no Claude call at all (see
// module comment above), just the starter template.
export async function suggestCommunicationStyle(
  draft: string | null,
  businessDescription: string | null,
): Promise<string> {
  const trimmedDraft = (draft || '').trim();
  if (!trimmedDraft) {
    return COMMUNICATION_STYLE_STARTER_TEMPLATE;
  }

  const userContent = JSON.stringify({
    draft: redactPotentialPii(trimmedDraft),
    accountContext: redactPotentialPii((businessDescription || '').trim()),
  });

  const result = await callClaudeTool<StyleToolResult>({
    scope: 'communication-style',
    model: CLAUDE_MODELS.contentGeneration,
    system: REFINE_STYLE_SYSTEM_PROMPT,
    userContent,
    tool: {
      name: 'refine_communication_style',
      description: 'Refine a rough draft of the account owner\'s communication style into a concise, concrete instruction.',
      input_schema: {
        type: 'object',
        properties: {
          styleDescription: { type: 'string' },
        },
        required: ['styleDescription'],
      },
    },
    maxTokens: 300,
    timeoutMs: 15000,
  });

  const refined = result?.styleDescription?.trim();
  // Claude unconfigured/timeout/malformed response - the user's own draft is still a perfectly
  // usable style description on its own, just unrefined. Never fall back to a fabricated one.
  return refined || trimmedDraft;
}
