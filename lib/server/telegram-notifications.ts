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
import { formatFallbackCoachingMessage, generateCoachingMessage, getWeeklyCoachingData, hasCoachableActivity } from './coaching';
import { findStaleActiveCampaigns } from './campaigns';

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

// Real coaching (2026-09-14): the proactive half of "real coaching" - the mentor agent already
// answers when asked (reactive), this is the once-a-week unprompted check-in with a real,
// personalized observation instead of a raw stats dump. Same cooldown-field pattern as the two
// nudges above (User.lastCoachingCheckinSentAt), same daily-cron reuse (no new cron slot).
const COACHING_CHECKIN_COOLDOWN_DAYS = 7;

function formatCoachingCheckinMessage(message: { summary: string; suggestion: string }): string {
  return `🎯 Podsumowanie tygodnia:\n\n${message.summary}\n\n💡 ${message.suggestion}`;
}

export async function sendWeeklyCoachingCheckins(): Promise<{ usersNotified: number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - COACHING_CHECKIN_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.user.findMany({
    where: {
      telegramChatId: { not: null },
      OR: [{ lastCoachingCheckinSentAt: null }, { lastCoachingCheckinSentAt: { lte: cutoff } }],
    },
    select: { id: true, telegramChatId: true, businessDescription: true },
  });

  let usersNotified = 0;

  for (const user of candidates) {
    const data = await getWeeklyCoachingData(user.id);

    // Same posture as sendInactivityNudges: nothing to coach about yet, don't manufacture a
    // message - a brand-new, untouched account gets silence here, not noise.
    if (!hasCoachableActivity(data)) {
      continue;
    }

    // AI enhances, template is the safety net - same pattern as caption generation
    // (ai-content.ts): a real, honest, data-only message beats no message at all.
    const message = (await generateCoachingMessage(data, user.businessDescription)) ?? formatFallbackCoachingMessage(data);

    try {
      await sendTelegramMessage(user.telegramChatId as string, formatCoachingCheckinMessage(message));
      usersNotified += 1;
    } catch (error) {
      logError('telegram-notifications', 'coaching-checkin-send-error', error, { userId: user.id });
      continue;
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastCoachingCheckinSentAt: now } });
  }

  logEvent('telegram-notifications', 'coaching-checkins-sent', { usersNotified });

  return { usersNotified };
}

// Campaigns (2026-09-14): the main risk of the "active campaign" model is forgetting to end one
// - a rare, cooldown-gated question instead of a hard auto-end, so a genuinely long campaign is
// never force-closed without the user's say. See findStaleActiveCampaigns in
// lib/server/campaigns.ts for the exact thresholds.
export async function sendStaleCampaignReminders(): Promise<{ usersNotified: number }> {
  const stale = await findStaleActiveCampaigns();
  let usersNotified = 0;

  for (const { userId, telegramChatId, campaignName } of stale) {
    try {
      await sendTelegramMessage(
        telegramChatId,
        `🎯 Kampania "${campaignName}" jest aktywna już jakiś czas. Wciąż trwa, czy zakończyć (/campaign-end) i zobaczyć wyniki?`,
      );
      usersNotified += 1;
    } catch (error) {
      logError('telegram-notifications', 'campaign-reminder-send-error', error, { userId });
      continue;
    }

    await prisma.user.update({ where: { id: userId }, data: { lastCampaignReminderSentAt: new Date() } });
  }

  logEvent('telegram-notifications', 'campaign-reminders-sent', { usersNotified });

  return { usersNotified };
}
