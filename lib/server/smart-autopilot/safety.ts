import type { SafetyFlag } from './types';

const EXECUTION_DENY_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /system\s+prompt/i,
  /developer\s+message/i,
  /execute\s+command/i,
  /run\s+shell/i,
  /bypass\s+safety/i,
];

// 2026-10-02 (AI review): the patterns used to have no `g` flag, so only the FIRST email/phone was
// redacted and the rest went to the AI as-is. The phone pattern also matched dates ("2026-09-28")
// and prices, and the 6+ digit "ID" pattern ate prices ("450000 zł").
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Phone numbers: optional +country code, then 9 digits grouped 3-3-3 / 3-2-2-2 or written solid
// (Polish mobile and landline formats). Not preceded/followed by another digit, so dates
// ("2026-09-28"), prices ("1 299 000") and postal codes ("00-950") don't match.
const PHONE_REGEX = /(?<![\d+])(?:\+\d{2}[\s-]?)?(?:\d{3}[\s-]?\d{3}[\s-]?\d{3}|\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})(?!\d)/g;
// Long digit runs that look like document/account numbers (PESEL 11, bank account 26) - prices
// and amounts are far shorter, so they're no longer touched.
const ID_REGEX = /\b\d{11,}\b/g;

function matches(regex: RegExp, value: string) {
  regex.lastIndex = 0;
  const found = regex.test(value);
  regex.lastIndex = 0;
  return found;
}

export function sanitizeUserInput(rawInput?: string) {
  if (!rawInput) {
    return '';
  }

  return rawInput
    .replace(/\u0000/g, '')
    .replace(/[\r\n]{3,}/g, '\n\n')
    .trim()
    .slice(0, 8_000);
}

export function collectSafetyFlags(input: { rawInput?: string; publishMode: 'draft' | 'auto' }) {
  const flags: SafetyFlag[] = [];
  const raw = input.rawInput || '';

  if (EXECUTION_DENY_PATTERNS.some((pattern) => pattern.test(raw))) {
    flags.push({
      code: 'PROMPT_INJECTION_PATTERN',
      severity: 'critical',
      message: 'Wykryto wzorzec prompt-injection.',
    });
  }

  if (matches(EMAIL_REGEX, raw)) {
    flags.push({
      code: 'PII_EMAIL',
      severity: 'medium',
      message: 'Wykryto adres e-mail w treści wejściowej.',
    });
  }

  if (matches(PHONE_REGEX, raw)) {
    flags.push({
      code: 'PII_PHONE',
      severity: 'medium',
      message: 'Wykryto numer telefonu w treści wejściowej.',
    });
  }

  if (matches(ID_REGEX, raw)) {
    flags.push({
      code: 'PII_ID_NUMBER',
      severity: 'low',
      message: 'Wykryto ciąg cyfr przypominający identyfikator.',
    });
  }

  if (input.publishMode === 'auto' && flags.some((flag) => flag.severity === 'critical')) {
    flags.push({
      code: 'UNSAFE_AUTO_PUBLISH',
      severity: 'critical',
      message: 'Auto-publish zablokowany przez krytyczny safety flag.',
    });
  }

  return flags;
}

// Post copy (2026-10-02): the owner often WANTS their own phone/email in the post ("zadzwoń:
// 600 100 200"), but it still shouldn't reach the AI provider. Contact details are swapped for
// numbered tokens the model is told to keep verbatim, then put back into the generated text - so
// the AI never sees them and the post never ends up with "[redacted-phone]" in it.
// One masker per AI request, shared by every field sent in it, so token numbers never collide.
export function createContactMasker() {
  const originals: string[] = [];
  const token = (kind: 'EMAIL' | 'TEL' | 'NR') => (match: string) => {
    originals.push(match);
    return `[[${kind}_${originals.length}]]`;
  };

  return {
    mask(value: string) {
      return value
        .replace(EMAIL_REGEX, token('EMAIL'))
        .replace(PHONE_REGEX, token('TEL'))
        .replace(ID_REGEX, token('NR'));
    },
    get hasTokens() {
      return originals.length > 0;
    },
    // Tokens the model invented or mangled are dropped rather than left in the post.
    restore(text: string) {
      return text
        .replace(/\[\[(?:EMAIL|TEL|NR)_(\d+)\]\]/g, (_, index: string) => originals[Number(index) - 1] ?? '')
        .trim();
    },
  };
}

export function redactPotentialPii(value: string) {
  return value
    .replace(EMAIL_REGEX, '[redacted-email]')
    .replace(PHONE_REGEX, '[redacted-phone]')
    .replace(ID_REGEX, '[redacted-id]');
}

// Same redaction, but keeps email addresses intact - used only by the agent-mentor
// (telegram-mentor-agent.ts). That agent has a legitimate reason to see real emails: its
// add_fan/record_sale tools let the user dictate a fan's email in conversation (EPIC 5), and
// blanket email redaction would silently break that feature (the agent would only ever see
// "[redacted-email]"). Phone numbers and ID-like digit strings are still stripped - the email
// exception is deliberate, not a general loosening.
export function redactPotentialPiiKeepingEmail(value: string) {
  return value.replace(PHONE_REGEX, '[redacted-phone]').replace(ID_REGEX, '[redacted-id]');
}
