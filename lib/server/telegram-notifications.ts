// TASK-3.2.2: proactive Telegram notifications for publish outcomes that weren't triggered by
// the user's own in-chat action (a scheduled post firing via cron/QStash, not a live
// /approve). Before this, the pipeline never told the user anything - they'd only find out by
// manually checking /status or /logs. DoD: "powiadomienia statusowe zbiorcze, tylko akcje/błędy
// pojedynczo" (status notifications batched, only actions/errors individually) - "actions" are
// already individual by construction (a command reply in the webhook handler itself); what was
// actually missing is this file: FAILED is urgent enough to notify immediately, SUCCESS is not
// (batched into one daily digest instead of a message per post).
import { prisma } from './prisma';
import { sendTelegramMessage } from './telegram';
import { logError, logEvent } from './observability';
import { checkSponsorshipGrowth } from './monetization';

export async function notifyJobFailedImmediately(jobId: string): Promise<void> {
  const job = await prisma.publishJob.findUnique({
    where: { id: jobId },
    include: {
      socialAccount: { select: { platform: true } },
      video: { select: { userId: true, user: { select: { telegramChatId: true } } } },
    },
  });

  if (!job || job.notifiedAt) {
    return;
  }

  const chatId = job.video.user.telegramChatId;
  if (!chatId) {
    // No linked Telegram account - nothing to notify, but still mark as handled so this job
    // is never picked up by a later notification sweep either.
    await prisma.publishJob.update({ where: { id: job.id }, data: { notifiedAt: new Date() } });
    return;
  }

  const message = `⚠️ Publikacja nie powiodła się: ${job.socialAccount.platform}\n${job.errorMessage ?? 'Nieznany błąd'}\n\nSpróbuj ponownie: /retry ${job.id}`;

  try {
    await sendTelegramMessage(chatId, message);
    logEvent('telegram-notifications', 'failure-notified', { jobId: job.id, platform: job.socialAccount.platform });
  } catch (error) {
    logError('telegram-notifications', 'failure-notify-error', error, { jobId: job.id });
  }

  await prisma.publishJob.update({ where: { id: job.id }, data: { notifiedAt: new Date() } });
}

type DigestEntry = { platform: string; remotePostUrl: string | null };

function formatDigestMessage(entries: DigestEntry[]): string {
  const lines = [`📋 Podsumowanie: ${entries.length} ${entries.length === 1 ? 'publikacja' : 'publikacji'} od ostatniego podsumowania:`, ''];

  entries.forEach((entry) => {
    lines.push(entry.remotePostUrl ? `✅ ${entry.platform}: ${entry.remotePostUrl}` : `✅ ${entry.platform}: opublikowano`);
  });

  return lines.join('\n');
}

// Called once daily by app/api/cron/telegram-digest. Every user with at least one un-notified
// SUCCESS job gets exactly one message, regardless of how many posts went out - that's the
// actual "batched" behavior the DoD asks for.
export async function sendMorningDigest(): Promise<{ usersNotified: number; jobsNotified: number }> {
  const pendingJobs = await prisma.publishJob.findMany({
    where: { status: 'SUCCESS', notifiedAt: null, video: { user: { telegramChatId: { not: null } } } },
    include: {
      socialAccount: { select: { platform: true } },
      video: { select: { userId: true, user: { select: { telegramChatId: true } } } },
    },
    orderBy: { publishedAt: 'asc' },
  });

  const byUser = new Map<string, { chatId: string; jobIds: string[]; entries: DigestEntry[] }>();

  for (const job of pendingJobs) {
    const chatId = job.video.user.telegramChatId;
    if (!chatId) {
      continue;
    }

    const existing = byUser.get(job.video.userId);
    const entry: DigestEntry = { platform: job.socialAccount.platform, remotePostUrl: job.remotePostUrl };

    if (existing) {
      existing.jobIds.push(job.id);
      existing.entries.push(entry);
    } else {
      byUser.set(job.video.userId, { chatId, jobIds: [job.id], entries: [entry] });
    }
  }

  let usersNotified = 0;
  let jobsNotified = 0;

  for (const [userId, { chatId, jobIds, entries }] of byUser) {
    try {
      await sendTelegramMessage(chatId, formatDigestMessage(entries));
      usersNotified += 1;
    } catch (error) {
      logError('telegram-notifications', 'digest-send-error', error, { userId, jobCount: jobIds.length });
      // Don't mark as notified if the send itself failed - next sweep retries these jobs.
      continue;
    }

    await prisma.publishJob.updateMany({ where: { id: { in: jobIds } }, data: { notifiedAt: new Date() } });
    jobsNotified += jobIds.length;
  }

  logEvent('telegram-notifications', 'digest-sent', { usersNotified, jobsNotified });

  return { usersNotified, jobsNotified };
}

// TASK-3.2.3: exact copy and threshold agreed with the product owner (2026-09-13) - a single
// neutral question about content/scheduling, deliberately with zero reference to wellbeing, sent
// rarely (never more often than the threshold itself, tracked via User.lastInactivityNudgeSentAt
// so it doesn't repeat daily once triggered).
const INACTIVITY_THRESHOLD_DAYS = 10;
const INACTIVITY_NUDGE_MESSAGE =
  'Nie było ostatnio aktywności na koncie — mam coś zaplanować, czy wszystko gra z materiałem?';

// Called from the same daily sweep as sendMorningDigest (app/api/cron/telegram-digest) rather
// than a separate cron entry - free-tier Vercel cron slots are limited, and this doesn't need
// its own schedule.
export async function sendInactivityNudges(): Promise<{ usersNotified: number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.user.findMany({
    where: {
      telegramChatId: { not: null },
      OR: [{ lastInactivityNudgeSentAt: null }, { lastInactivityNudgeSentAt: { lte: cutoff } }],
    },
    select: { id: true, telegramChatId: true },
  });

  let usersNotified = 0;

  for (const user of candidates) {
    const lastJob = await prisma.publishJob.findFirst({
      where: { video: { userId: user.id } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    // Never touched the pipeline at all - that's "hasn't started yet", not "went quiet after
    // being active", and isn't what this nudge is for.
    if (!lastJob || lastJob.createdAt > cutoff) {
      continue;
    }

    try {
      await sendTelegramMessage(user.telegramChatId as string, INACTIVITY_NUDGE_MESSAGE);
      usersNotified += 1;
    } catch (error) {
      logError('telegram-notifications', 'inactivity-nudge-send-error', error, { userId: user.id });
      continue;
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastInactivityNudgeSentAt: now } });
  }

  logEvent('telegram-notifications', 'inactivity-nudges-sent', { usersNotified });

  return { usersNotified };
}

// TASK-5.4.3 (Agent sponsoringu, EPIC 5 - zakres tej sesji): rzadki, jednorazowy-na-okres sygnał
// gdy zasięg realnie rośnie (PostMetric, ten sam mechanizm co EPIC 4), nie pełny agent
// przygotowujący wycenę współpracy - appka nie ma danych o realnych stawkach rynkowych.
// Cooldown przez User.lastSponsorshipSignalSentAt, ten sam wzorzec co sendInactivityNudges.
const SPONSORSHIP_SIGNAL_COOLDOWN_DAYS = 30;

function formatSponsorshipSignalMessage(currentViews: number, priorViews: number): string {
  return `📈 Twój zasięg mocno rośnie: ${currentViews} wyświetleń w ostatnich 30 dniach (wcześniej ${priorViews}) — to może być dobry moment, żeby rozważyć płatne współprace. /revenue pokaże pełny obraz.`;
}

export async function sendSponsorshipSignals(): Promise<{ usersNotified: number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - SPONSORSHIP_SIGNAL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.user.findMany({
    where: {
      telegramChatId: { not: null },
      OR: [{ lastSponsorshipSignalSentAt: null }, { lastSponsorshipSignalSentAt: { lte: cutoff } }],
    },
    select: { id: true, telegramChatId: true },
  });

  let usersNotified = 0;

  for (const user of candidates) {
    const signal = await checkSponsorshipGrowth(user.id);
    if (!signal.triggered) {
      continue;
    }

    try {
      await sendTelegramMessage(user.telegramChatId as string, formatSponsorshipSignalMessage(signal.currentViews, signal.priorViews));
      usersNotified += 1;
    } catch (error) {
      logError('telegram-notifications', 'sponsorship-signal-send-error', error, { userId: user.id });
      continue;
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastSponsorshipSignalSentAt: now } });
  }

  logEvent('telegram-notifications', 'sponsorship-signals-sent', { usersNotified });

  return { usersNotified };
}
