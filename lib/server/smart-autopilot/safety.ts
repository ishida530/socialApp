import type { SafetyFlag } from './types';

const EXECUTION_DENY_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /system\s+prompt/i,
  /developer\s+message/i,
  /execute\s+command/i,
  /run\s+shell/i,
  /bypass\s+safety/i,
];

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_REGEX = /\+?[0-9][0-9\-\s()]{6,}[0-9]/;
const ID_REGEX = /\b\d{6,}\b/;

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

  if (EMAIL_REGEX.test(raw)) {
    flags.push({
      code: 'PII_EMAIL',
      severity: 'medium',
      message: 'Wykryto adres e-mail w treści wejściowej.',
    });
  }

  if (PHONE_REGEX.test(raw)) {
    flags.push({
      code: 'PII_PHONE',
      severity: 'medium',
      message: 'Wykryto numer telefonu w treści wejściowej.',
    });
  }

  if (ID_REGEX.test(raw)) {
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

export function redactPotentialPii(value: string) {
  return value
    .replace(EMAIL_REGEX, '[redacted-email]')
    .replace(PHONE_REGEX, '[redacted-phone]')
    .replace(ID_REGEX, '[redacted-id]');
}
