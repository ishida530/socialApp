// Alert the app owner when the AI provider rejects requests for an account-level reason (2026-10-02,
// AI review). An exhausted Anthropic credit balance used to surface only as template captions in
// users' drafts - now the first such failure emails the admins, at most once an hour.
import { consumeRateLimit } from './rate-limit';
import { logError } from './observability';
import { sendAdminAlertEmail } from '@/lib/mail/service';

const ALERT_WINDOW_MS = 60 * 60 * 1000;

type ProviderFailure = { status: number; type: string; message: string };

// Problems no retry or code path can fix - someone has to act in the Anthropic console.
export function classifyProviderFailure(failure: ProviderFailure): string | null {
  const text = `${failure.type} ${failure.message}`.toLowerCase();
  if (text.includes('credit balance')) {
    return 'Na koncie Anthropic skończyły się środki. Funkcje AI (opisy postów, sugestie, asystent Telegram) działają w trybie awaryjnym bez AI.';
  }
  if (failure.status === 401 || text.includes('authentication_error')) {
    return 'Klucz ANTHROPIC_API_KEY jest nieprawidłowy albo został unieważniony. Funkcje AI nie działają.';
  }
  if (failure.status === 403 || text.includes('permission_error')) {
    return 'Klucz ANTHROPIC_API_KEY nie ma uprawnień do używanego modelu. Funkcje AI nie działają.';
  }
  return null;
}

function alertRecipients() {
  return (process.env.AI_ALERT_EMAILS || process.env.ADMIN_EMAILS || process.env.CONTACT_EMAIL_TO || '')
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function reportAiProviderProblem(failure: ProviderFailure): Promise<void> {
  const problem = classifyProviderFailure(failure);
  if (!problem) {
    return;
  }

  const recipients = alertRecipients();
  if (recipients.length === 0 || !process.env.RESEND_API_KEY || process.env.NODE_ENV === 'test') {
    return;
  }

  try {
    const slot = await consumeRateLimit({ key: 'ai-alerts:provider-problem', limit: 1, windowMs: ALERT_WINDOW_MS });
    if (!slot.allowed) {
      return;
    }

    await sendAdminAlertEmail(
      recipients,
      'AI nie działa',
      `${problem}\n\nOdpowiedź Anthropic: HTTP ${failure.status} ${failure.type} ${failure.message}`.trim() +
        '\n\nCo zrobić: https://console.anthropic.com → Plans & Billing (doładuj środki, włącz Auto-reload) ' +
        'albo API Keys (nowy klucz → zmienna ANTHROPIC_API_KEY w Vercelu → Redeploy).' +
        '\n\nKolejny alert najwcześniej za godzinę.',
    );
  } catch (error) {
    // Best effort - an alert must never break the request that triggered it.
    logError('ai-alerts', 'send-failed', error);
  }
}
