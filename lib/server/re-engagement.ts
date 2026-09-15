// TASK-9.2 (2026-09-15): a one-time email nudge for users who registered on web but never linked
// their Telegram account. Every other proactive reminder in telegram-notifications.ts goes over
// Telegram and is gated on telegramChatId being set, so without this, a web-only user gets zero
// proactive contact after signup - ever. Deliberately ONE-TIME (gated on
// lastTelegramLinkReminderSentAt being null, not a repeating cooldown like the inactivity/coaching
// nudges) - this is a single onboarding nudge, not a recurring marketing email.
import { prisma } from './prisma';
import { sendTelegramLinkReminderEmail } from '@/lib/mail/service';
import { logError, logEvent } from './observability';

// Grace period before the nudge fires, so a user mid-onboarding (about to link Telegram anyway)
// doesn't get an email moments after signing up.
const SIGNUP_GRACE_PERIOD_DAYS = 3;

export async function sendTelegramLinkReminders(): Promise<{ usersNotified: number }> {
  const cutoff = new Date(Date.now() - SIGNUP_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.user.findMany({
    where: {
      telegramChatId: null,
      lastTelegramLinkReminderSentAt: null,
      createdAt: { lte: cutoff },
    },
    select: { id: true, email: true, name: true },
  });

  let usersNotified = 0;

  for (const user of candidates) {
    try {
      await sendTelegramLinkReminderEmail(user.email, user.name);
      usersNotified += 1;
    } catch (error) {
      logError('re-engagement', 'telegram-link-reminder-send-error', error, { userId: user.id });
      continue;
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastTelegramLinkReminderSentAt: new Date() } });
  }

  logEvent('re-engagement', 'telegram-link-reminders-sent', { usersNotified });

  return { usersNotified };
}
