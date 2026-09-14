import { NextRequest, NextResponse } from 'next/server';
import {
  answerTelegramCallbackQuery,
  consumeTelegramLinkCode,
  editTelegramMessage,
  findUserByTelegramChatId,
  sendTelegramMessage,
  sendTelegramMessageWithButtons,
  setPublishingPaused,
  TELEGRAM_MAX_DOWNLOADABLE_FILE_BYTES,
  uploadTelegramMediaAsVideo,
  verifyTelegramWebhookSecret,
} from '@/lib/server/telegram';
import {
  cancelPublishJob,
  createDraftGroupForVideo,
  enqueueDraftGroup,
  enqueueDraftGroupOptimally,
  getRecentActivityForUser,
  getRecentContentForIdeas,
  getTelegramStatusSnapshot,
  retryPublishJob,
  triggerPublishJob,
} from '@/lib/server/publish-jobs';
import { generateContentIdeas, type ContentIdea } from '@/lib/server/telegram-content-ideas';
import { runMentorTurn } from '@/lib/server/telegram-mentor-agent';
import type { ScheduleSlot } from '@/lib/server/smart-autopilot/types';
import { addFan, getFanCount, getRecentFans, getRevenueSummary, isValidEmail, parseAmountToCents, recordSale } from '@/lib/server/monetization';
import { completeGoal, getActiveGoals, setGoal } from '@/lib/server/coaching';
import { endActiveCampaign, getActiveCampaign, getCampaignReport, listRecentCampaigns, startCampaign, type CampaignReport } from '@/lib/server/campaigns';
import { getFollowerGrowth, type FollowerGrowthEntry } from '@/lib/server/account-growth';
import { acceptSuggestedReply, ignoreComment, sendCustomReply } from '@/lib/server/social-comments';
import { prisma } from '@/lib/server/prisma';
import { unauthorized } from '@/lib/server/http';
import { logError, logEvent } from '@/lib/server/observability';
import { runWithRequestId } from '@/lib/server/request-context';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { parseTelegramEditReply } from '@/lib/server/telegram-edit-parser';
import { parseTelegramScheduleReply } from '@/lib/server/telegram-schedule-parser';

type TelegramPhotoSize = { file_id: string; file_size?: number };
type TelegramVideo = { file_id: string; file_size?: number; mime_type?: string };

type TelegramUpdate = {
  message?: {
    message_id?: number;
    chat?: { id?: number | string };
    text?: string;
    caption?: string;
    photo?: TelegramPhotoSize[];
    video?: TelegramVideo;
    document?: { file_id: string; file_size?: number; mime_type?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat?: { id?: number | string }; message_id?: number };
  };
};

function resolveRateLimitChatId(update: TelegramUpdate): string | null {
  const callbackChatId = update.callback_query?.message?.chat?.id;
  if (callbackChatId !== undefined && callbackChatId !== null) {
    return String(callbackChatId);
  }

  const messageChatId = update.message?.chat?.id;
  if (messageChatId !== undefined && messageChatId !== null) {
    return String(messageChatId);
  }

  return null;
}

// TASK-3.1.2 (decyzja PO 2026-09-13, "zostaw jak jest"): /approve, /retry i przycisk Publikuj
// publikują synchronicznie wewnątrz tego handlera - dla wolnego protokołu (np. 3-etapowy upload
// Facebook Reels) mogłoby to zbliżyć się do domyślnego limitu czasu funkcji Vercela. Zamiast
// przebudowy na kolejkę (odrzucone - brak dowodu na realny problem, kosztowna zmiana UX
// natychmiastowego wyniku), tani margines bezpieczeństwa: ten sam maxDuration co
// app/api/videos/upload/route.ts.
export const maxDuration = 60;

const START_COMMAND_PATTERN = /^\/start(?:@\w+)?\s+(\S+)/i;
const VALID_TOGGLE_PLATFORMS = ['YOUTUBE', 'TIKTOK', 'INSTAGRAM', 'FACEBOOK'];

type PreviewJob = {
  socialAccount: { platform: string };
  excludedFromPublish: boolean;
  metaPostFormat: string | null;
  video: { mediaType: string; durationSec: number | null };
};

// One row of Publikuj/Anuluj was the whole control surface Telegram had - no way to skip a
// single platform for one post, no visibility into which format (Reels vs Feed vs Shorts) it
// would go out as, and no way to fix the AI-generated caption without leaving the chat (the web
// composer has all of this via ScheduleStep checkboxes, MetaFormatPanel, and per-platform
// caption editing). This is the Telegram equivalent, built entirely as inline-keyboard/free-text
// turns that edit the same preview message in place where possible - see
// postfly-plan-projektu.md's discussion of Telegram as "pełny punkt kontroli".
// Reels vs Feed is only a two-way choice (unlike TikTok's privacy_level + duet/stitch/comment
// combo, which genuinely doesn't fit inline buttons) - no reason to make this web-only. Toggling
// here also updates SocialAccount.lastMetaPostFormat, the same "sticky default" write-through
// PATCH .../drafts/:id already does, so a choice made here sticks for future posts on either
// channel too.
function canToggleMetaFormat(job: PreviewJob) {
  return (job.socialAccount.platform === 'FACEBOOK' || job.socialAccount.platform === 'INSTAGRAM') && job.video.mediaType === 'VIDEO';
}

function buildPreviewButtons(postGroupId: string, jobs: PreviewJob[]) {
  const platformRows = jobs.map((job) => {
    const row = [
      {
        text: `${job.excludedFromPublish ? '☐' : '✅'} ${job.socialAccount.platform}`,
        callback_data: `toggle:${postGroupId}:${job.socialAccount.platform}`,
      },
      {
        text: '✏️ Edytuj',
        callback_data: `editstart:${postGroupId}:${job.socialAccount.platform}`,
      },
    ];

    if (canToggleMetaFormat(job)) {
      const label =
        job.metaPostFormat === 'FEED' ? '📋 Zwykły post' : job.metaPostFormat === 'BOTH' ? '🎬📋 Oba' : '🎬 Reels';
      row.push({ text: label, callback_data: `formattoggle:${postGroupId}:${job.socialAccount.platform}` });
    }

    return row;
  });

  return [
    ...platformRows,
    [
      { text: '✅ Publikuj', callback_data: `publish:${postGroupId}` },
      { text: '📅 Zaplanuj', callback_data: `schedulestart:${postGroupId}` },
    ],
    [
      // Autopilot / feedback loop (2026-09-14): applies the same per-platform data-driven time
      // shown as "💡 Sugerowana pora" in the message text above - one tap instead of reading the
      // suggestion and typing a matching date/time into "📅 Zaplanuj".
      { text: '🎯 Zaplanuj optymalnie', callback_data: `scheduleoptimal:${postGroupId}` },
      { text: '❌ Anuluj', callback_data: `cancel:${postGroupId}` },
    ],
  ];
}

// YouTube's Shorts-vs-regular-video split isn't a parameter we control (YouTube classifies it
// from duration + aspect ratio, and we only track duration) - shown as a best-effort estimate,
// not a promise, same honesty the MediaStep duration warning already uses on the web side.
const YOUTUBE_SHORTS_MAX_SEC = 180;

function describePlatformFormat(job: PreviewJob) {
  const platform = job.socialAccount.platform;

  if (job.video.mediaType === 'IMAGE') {
    return 'zdjęcie';
  }

  if (platform === 'TIKTOK') {
    return 'wideo';
  }

  if (platform === 'INSTAGRAM' || platform === 'FACEBOOK') {
    if (job.metaPostFormat === 'FEED') {
      return 'zwykły post';
    }
    if (job.metaPostFormat === 'BOTH') {
      return 'Reels + zwykły post (2 osobne publikacje)';
    }
    return 'Reels';
  }

  if (platform === 'YOUTUBE') {
    const duration = job.video.durationSec;
    if (typeof duration === 'number' && duration > 0) {
      return duration <= YOUTUBE_SHORTS_MAX_SEC ? 'prawdopodobnie Shorts (≤3 min)' : 'zwykłe wideo (>3 min)';
    }
    return 'wideo (Shorts czy zwykłe - zależy od długości/proporcji)';
  }

  return 'post';
}

// EPIC 4 ("popraw"): orchestrateContent already computes a reasoned schedule suggestion for
// every draft - previously silently discarded (composer-drafts.ts only returned the captions).
// Shown here as information only (doesn't change scheduledFor on its own - actual scheduling
// still happens via the existing "📅 Zaplanuj"/Publikuj flow), so the loop's output is visible
// instead of invisible. One line, the highest-scored slot only - not a full per-platform table.
function describeScheduleSuggestion(schedule: ScheduleSlot[]): string | null {
  if (schedule.length === 0) {
    return null;
  }

  const best = [...schedule].sort((a, b) => b.score - a.score)[0];
  const localTime = new Date(best.scheduledFor).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: best.timezone,
  });

  const isDataDriven = !best.reason.toLowerCase().includes('brak danych historycznych');
  const suffix = isDataDriven ? '(na podstawie Twoich wcześniejszych publikacji)' : '(baseline - jeszcze za mało Twoich danych)';

  return `💡 Sugerowana pora: ${localTime} ${suffix}`;
}

function buildPreviewMessage(jobs: PreviewJob[], schedule: ScheduleSlot[] = []) {
  const lines = jobs.map(
    (job) => `${job.excludedFromPublish ? '☐' : '✅'} ${job.socialAccount.platform} — ${describePlatformFormat(job)}`,
  );

  const scheduleSuggestion = describeScheduleSuggestion(schedule);

  return [
    'Materiał odebrany! Oto co przygotowałem:',
    '',
    ...lines,
    ...(scheduleSuggestion ? ['', scheduleSuggestion] : []),
    '',
    'Odznacz platformę żeby ją pominąć, ✏️ Edytuj żeby poprawić opis/hashtagi/tytuł, 🎬/📋 żeby przełączyć Reels/zwykły post (Facebook/Instagram), potem zatwierdź albo anuluj.',
  ].join('\n');
}

// Autopilot (2026-09-14): the zero-tap confirmation - still sent, because "brak reakcji = nie
// publikuj" is replaced here by an explicit opt-in (/autopilot on), not by silence. Each platform
// gets its own line with its own data-driven time (PublishJob.scheduledFor after
// enqueueDraftGroupOptimally), not one shared time for the whole post.
function formatAutopilotScheduledMessage(scheduled: Array<{ socialAccount: { platform: string }; scheduledFor: Date }>): string {
  const lines = scheduled.map((job) => {
    const formatted = job.scheduledFor.toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw' });
    return `✅ ${job.socialAccount.platform} — ${formatted}`;
  });

  return [
    '🤖 Autopilot: zaplanowałem publikację na podstawie Twoich dotychczasowych wyników:',
    '',
    ...lines,
    '',
    'Żeby anulować dowolną z tych publikacji, użyj /logs żeby znaleźć ID, potem /cancel <id>. Autopilot wyłączysz przez /autopilot off.',
  ].join('\n');
}

async function handleStartCommand(chatIdStr: string, code: string) {
  const result = await consumeTelegramLinkCode(code, chatIdStr);

  if (result.status === 'linked') {
    logEvent('telegram', 'account-linked', { userId: result.userId });

    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      select: { businessDescription: true },
    });

    if (!user?.businessDescription) {
      // Onboarding: ask once, before anything else - the answer shapes every caption/hashtag
      // Claude generates for this account from now on (lib/server/smart-autopilot/ai-content.ts).
      // /skip is explicit and immediate, not a silent timeout - see handleBusinessDescriptionReply.
      await prisma.user.update({
        where: { id: result.userId },
        data: { telegramAwaitingBusinessDescription: true },
      });
      await sendTelegramMessage(
        chatIdStr,
        'Konto Postfly połączone! Zanim zaczniemy: opisz w 1-2 zdaniach czym zajmuje się to konto (np. "Jestem raperem, publikuję freestyle" albo "Prowadzę salon kosmetyczny, oferujemy paznokcie i rzęsy") - dzięki temu dopasuję ton i styl generowanych opisów. Możesz też wpisać /skip i zrobić to później w ustawieniach konta.',
      ).catch((error) => logError('telegram', 'send-onboarding-prompt-failed', error, { chatId: chatIdStr }));
      return;
    }

    await sendTelegramMessage(
      chatIdStr,
      'Konto Postfly połączone! Wyślij mi wideo albo zdjęcie (dodaj podpis pod plikiem, żeby AI wiedziało o czym jest ten materiał), a przygotuję dla Ciebie post.',
    ).catch((error) => logError('telegram', 'send-link-confirmation-failed', error, { chatId: chatIdStr }));
  } else {
    await sendTelegramMessage(
      chatIdStr,
      'Ten kod jest nieprawidłowy albo wygasł. Wygeneruj nowy kod w panelu Postfly (Ustawienia konta) i spróbuj ponownie.',
    ).catch((error) => logError('telegram', 'send-invalid-code-failed', error, { chatId: chatIdStr }));
  }
}

async function handleIncomingMedia(
  chatIdStr: string,
  userId: string,
  media: { fileId: string; fileSize?: number; mediaType: 'VIDEO' | 'IMAGE'; caption?: string },
  autopilotEnabled: boolean,
) {
  if (media.fileSize && media.fileSize > TELEGRAM_MAX_DOWNLOADABLE_FILE_BYTES) {
    await sendTelegramMessage(
      chatIdStr,
      'Ten plik jest za duży (limit Telegrama dla botów to 20 MB). Wyślij mniejszy plik albo dodaj materiał przez panel Postfly.',
    ).catch((error) => logError('telegram', 'send-file-too-large-failed', error, { chatId: chatIdStr }));
    return;
  }

  // UX: uploadTelegramMediaAsVideo (download + blob upload) and createDraftGroupForVideo (real
  // Claude calls, one per target platform) below can easily take several seconds to over a
  // minute combined - without this, the chat goes silent the instant the file is sent, with
  // nothing distinguishing "still working" from "the bot is broken". Best-effort, never blocks
  // the actual processing on whether this send succeeds.
  await sendTelegramMessage(
    chatIdStr,
    '📥 Odebrano! Przetwarzam materiał i przygotowuję treść dla platform - może to potrwać do minuty...',
  ).catch((error) => logError('telegram', 'send-processing-ack-failed', error, { chatId: chatIdStr }));

  try {
    const video = await uploadTelegramMediaAsVideo(userId, media.fileId, media.mediaType, `Telegram ${new Date().toISOString()}`);
    // Telegram lets a user attach a text caption to the photo/video itself - the natural place
    // to say what this post is about, no separate step needed. Without it, generatePlatformBundles
    // gets an empty rawInput and falls back to a generic caption ("Krotka aktualizacja: Nowa
    // publikacja gotowa do harmonogramu.") since it has nothing to work from.
    const draftResult = await createDraftGroupForVideo(userId, video.id, {
      contentType: media.caption?.trim() || undefined,
    });

    if (!draftResult.ok) {
      await sendTelegramMessage(chatIdStr, `Nie udało się przygotować posta: ${draftResult.error}`).catch((error) =>
        logError('telegram', 'send-draft-error-failed', error, { chatId: chatIdStr }),
      );
      return;
    }

    // BUG-003: enqueueDraftGroup wymaga tiktokPrivacyLevel na DRAFT jobie TikToka zanim
    // pozwoli opublikować - kreator web ustawia to w kroku przeglądu, ale upload z Telegrama
    // nie przechodzi przez ten krok, więc bez tego "Publikuj" zawsze failowałby dla TikToka
    // (i tym samym dla WSZYSTKICH platform naraz, bo enqueueDraftGroup jest wszystko-albo-nic).
    // Domyślny SELF_ONLY (najbezpieczniejszy, tylko dla autora) - kliknięcie "Publikuj" na
    // Telegramie liczy się jako zgoda, dokładnie jak opisano w logu ról TASK-3.1.2.
    const tiktokJob = draftResult.jobs.find((job) => job.socialAccount.platform === 'TIKTOK');
    if (tiktokJob && !tiktokJob.tiktokPrivacyLevel) {
      await prisma.publishJob.update({
        where: { id: tiktokJob.id },
        data: { tiktokPrivacyLevel: 'SELF_ONLY' },
      });
    }

    // Autopilot (2026-09-14): opt-in zero-tap path - skips the manual preview entirely for
    // whatever's ready, using the same data-driven per-platform schedule as "🎯 Zaplanuj
    // optymalnie" below. Still respects the orchestrator's own critical-safety-flag rule (falls
    // through to the normal manual preview in that case, same as a non-autopilot account would
    // see) - autopilot never bypasses that gate, it only removes the routine tap.
    if (autopilotEnabled && !draftResult.hasCriticalSafety) {
      const optimalResult = await enqueueDraftGroupOptimally(userId, draftResult.postGroupId);

      if (optimalResult.ok && optimalResult.scheduled.length > 0) {
        await sendTelegramMessage(chatIdStr, formatAutopilotScheduledMessage(optimalResult.scheduled)).catch((error) =>
          logError('telegram', 'send-autopilot-summary-failed', error, { chatId: chatIdStr }),
        );

        if (optimalResult.skippedPlatforms.length > 0) {
          const remainingJobs = await prisma.publishJob.findMany({
            where: { postGroupId: draftResult.postGroupId, status: 'DRAFT' },
            include: { socialAccount: true, video: true },
          });

          if (remainingJobs.length > 0) {
            await sendTelegramMessageWithButtons(
              chatIdStr,
              `⚠️ ${optimalResult.skippedPlatforms.join(', ')} wymaga ręcznej akceptacji (autopilot to pominął):\n\n${buildPreviewMessage(remainingJobs)}`,
              buildPreviewButtons(draftResult.postGroupId, remainingJobs),
            ).catch((error) => logError('telegram', 'send-autopilot-remainder-failed', error, { chatId: chatIdStr }));
          }
        }

        return;
      }
    }

    await sendTelegramMessageWithButtons(
      chatIdStr,
      buildPreviewMessage(draftResult.jobs, draftResult.schedule),
      buildPreviewButtons(draftResult.postGroupId, draftResult.jobs),
    ).catch((error) => logError('telegram', 'send-preview-failed', error, { chatId: chatIdStr }));
  } catch (error) {
    logError('telegram', 'media-upload-failed', error, { chatId: chatIdStr });
    await sendTelegramMessage(
      chatIdStr,
      'Coś poszło nie tak przy przetwarzaniu materiału. Spróbuj ponownie albo dodaj go przez panel Postfly.',
    ).catch(() => {});
  }
}

// Consumes the free-text reply to the onboarding prompt started in handleStartCommand. Same
// clear-session-first pattern as handleEditReply below - an abandoned/malformed reply can never
// wedge the chat into treating every future message as an onboarding answer.
async function handleBusinessDescriptionReply(chatIdStr: string, userId: string, rawText: string) {
  await prisma.user.update({ where: { id: userId }, data: { telegramAwaitingBusinessDescription: false } });

  const trimmed = rawText.trim();

  if (trimmed.toLowerCase() === '/skip') {
    await sendTelegramMessage(
      chatIdStr,
      'Jasne, pominięte - możesz to uzupełnić później w panelu Postfly (Ustawienia konta). Wyślij mi wideo albo zdjęcie, a przygotuję dla Ciebie post.',
    ).catch((error) => logError('telegram', 'send-onboarding-skip-failed', error, { chatId: chatIdStr }));
    return;
  }

  if (!trimmed) {
    await sendTelegramMessage(
      chatIdStr,
      'Nie rozpoznałem opisu - wyślij mi po prostu wideo albo zdjęcie, opis konta możesz uzupełnić później w Ustawieniach konta.',
    ).catch((error) => logError('telegram', 'send-onboarding-empty-failed', error, { chatId: chatIdStr }));
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { businessDescription: trimmed.slice(0, 500) },
  });

  await sendTelegramMessage(
    chatIdStr,
    'Zapisane! Wyślij mi teraz wideo albo zdjęcie, a przygotuję dla Ciebie post dopasowany do tego kontekstu.',
  ).catch((error) => logError('telegram', 'send-onboarding-saved-failed', error, { chatId: chatIdStr }));
}

// Consumes the free-text reply started by the "✏️ Edytuj" button (see the `editstart` callback
// below). User.telegramEditingJobId is the only piece of server-side state needed to make an
// ordinary text message mean "this is the new caption for that job", since each webhook request
// is otherwise stateless. Always clears the session first (not "on success") so a malformed or
// abandoned edit can never wedge the chat into treating every future message as edit content.
async function handleEditReply(chatIdStr: string, userId: string, jobId: string, rawText: string) {
  const job = await prisma.publishJob.findFirst({
    where: { id: jobId, status: 'DRAFT', video: { userId } },
    include: { socialAccount: true },
  });

  await prisma.user.update({ where: { id: userId }, data: { telegramEditingJobId: null } });

  if (!job) {
    await sendTelegramMessage(
      chatIdStr,
      'Ten post nie jest już dostępny do edycji (opublikowany albo anulowany w międzyczasie).',
    ).catch((error) => logError('telegram', 'send-edit-stale-job-failed', error, { chatId: chatIdStr }));
    return;
  }

  const parsed = parseTelegramEditReply(rawText, job.socialAccount.platform === 'YOUTUBE');

  if (!parsed) {
    await prisma.user.update({ where: { id: userId }, data: { telegramEditingJobId: jobId } });
    await sendTelegramMessage(
      chatIdStr,
      'Nie rozpoznałem treści. Wyślij opis (opcjonalnie z hashtagami na końcu, zaczynającymi się od #).',
    ).catch((error) => logError('telegram', 'send-edit-unparseable-failed', error, { chatId: chatIdStr }));
    return;
  }

  await prisma.publishJob.update({
    where: { id: job.id },
    data: {
      ...(parsed.caption !== undefined ? { caption: parsed.caption } : {}),
      ...(parsed.hashtags !== undefined ? { hashtags: parsed.hashtags } : {}),
      ...(parsed.title !== undefined ? { title: parsed.title } : {}),
    },
  });

  const allJobs = await prisma.publishJob.findMany({
    where: { postGroupId: job.postGroupId, status: 'DRAFT', video: { userId } },
    include: { socialAccount: true, video: true },
    orderBy: { createdAt: 'asc' },
  });

  await sendTelegramMessage(chatIdStr, `Zaktualizowano ${job.socialAccount.platform}.`).catch((error) =>
    logError('telegram', 'send-edit-confirmation-failed', error, { chatId: chatIdStr }),
  );

  await sendTelegramMessageWithButtons(chatIdStr, buildPreviewMessage(allJobs), buildPreviewButtons(job.postGroupId, allJobs)).catch(
    (error) => logError('telegram', 'send-preview-after-edit-failed', error, { chatId: chatIdStr }),
  );
}

// Consumes the free-text reply started by the "📅 Zaplanuj" button. Same session-state pattern
// as handleEditReply (User.telegramSchedulingPostGroupId, always cleared first), but the parsed
// result feeds enqueueDraftGroup(publishNow: false) - which schedules the precise QStash trigger
// (lib/server/qstash.ts) and keeps the daily cron as its fallback, exactly like "Zaplanuj" in the
// web composer.
async function handleScheduleReply(chatIdStr: string, userId: string, postGroupId: string, rawText: string) {
  await prisma.user.update({ where: { id: userId }, data: { telegramSchedulingPostGroupId: null } });

  const parsedDate = parseTelegramScheduleReply(rawText);
  if (!parsedDate) {
    await prisma.user.update({ where: { id: userId }, data: { telegramSchedulingPostGroupId: postGroupId } });
    await sendTelegramMessage(
      chatIdStr,
      'Nie rozpoznałem terminu. Wyślij np. "za 30 minut", "jutro 19:00" albo "20.09.2026 19:00".',
    ).catch((error) => logError('telegram', 'send-schedule-unparseable-failed', error, { chatId: chatIdStr }));
    return;
  }

  const draftJobs = await prisma.publishJob.findMany({
    where: { postGroupId, status: 'DRAFT', video: { userId } },
    include: { socialAccount: true },
  });

  if (draftJobs.length === 0) {
    await sendTelegramMessage(
      chatIdStr,
      'Ten post nie jest już dostępny (opublikowany albo anulowany w międzyczasie).',
    ).catch((error) => logError('telegram', 'send-schedule-stale-group-failed', error, { chatId: chatIdStr }));
    return;
  }

  const targetPlatforms = draftJobs.filter((job) => !job.excludedFromPublish).map((job) => job.socialAccount.platform);

  if (targetPlatforms.length === 0) {
    await sendTelegramMessage(chatIdStr, 'Wszystkie platformy odznaczone - nie ma czego zaplanować.').catch((error) =>
      logError('telegram', 'send-schedule-none-selected-failed', error, { chatId: chatIdStr }),
    );
    return;
  }

  const result = await enqueueDraftGroup(userId, {
    postGroupId,
    publishNow: false,
    scheduledDate: parsedDate.toISOString(),
    tiktokPostingConsent: targetPlatforms.includes('TIKTOK'),
    targetPlatforms,
  });

  if (!result.ok) {
    await sendTelegramMessage(chatIdStr, `Nie udało się zaplanować: ${result.error}`).catch((error) =>
      logError('telegram', 'send-schedule-error-failed', error, { chatId: chatIdStr }),
    );
    return;
  }

  const formatted = parsedDate.toLocaleString('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Warsaw',
  });

  await sendTelegramMessage(
    chatIdStr,
    `📅 Zaplanowano na ${formatted}. Platformy: ${targetPlatforms.join(', ')}.`,
  ).catch((error) => logError('telegram', 'send-schedule-confirmation-failed', error, { chatId: chatIdStr }));
}

// EPIC 11 Sprint 11.2: consumes the free-text reply started by the "✏️ Napisz własną" button on a
// detected comment. Same session-state pattern as handleEditReply/handleScheduleReply (always
// clears the flag first) - TASK-11.2.8's content-confirmation gate is satisfied by construction
// here: the user is dictating the literal text that gets sent, the send itself is the approval.
async function handleCommentReplyText(chatIdStr: string, userId: string, commentId: string, rawText: string) {
  await prisma.user.update({ where: { id: userId }, data: { telegramReplyingToCommentId: null } });

  const result = await sendCustomReply(commentId, userId, rawText);
  await sendTelegramMessage(chatIdStr, result.ok ? '✅ Odpowiedź wysłana.' : result.error).catch((error) =>
    logError('telegram', 'send-comment-custom-reply-result-failed', error, { chatId: chatIdStr }),
  );
}

function formatContentIdeasMessage(ideas: ContentIdea[]): string {
  const lines = ['💡 Pomysły na kolejne nagrania:', ''];
  ideas.forEach((idea, index) => {
    lines.push(`${index + 1}. ${idea.title}`);
    lines.push(idea.description);
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

function formatActivityMessage(entries: Awaited<ReturnType<typeof getRecentActivityForUser>>): string {
  if (entries.length === 0) {
    return '📋 Brak zakończonych zadań publikacji w historii.';
  }

  const lines = ['📋 Ostatnie zadania:', ''];

  entries.forEach((entry) => {
    const when = entry.updatedAt.toLocaleString('pl-PL', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Europe/Warsaw',
    });

    if (entry.status === 'SUCCESS') {
      lines.push(
        entry.remotePostUrl
          ? `✅ ${entry.platform} (${when}): ${entry.remotePostUrl}`
          : `✅ ${entry.platform} (${when}): opublikowano`,
      );
      return;
    }

    if (entry.status === 'CANCELED') {
      lines.push(`❌ ${entry.platform} (${when}): anulowano`);
      return;
    }

    lines.push(`⚠️ ${entry.platform} (${when}): ${entry.errorMessage ?? 'nieznany błąd'} [${entry.id}]`);
  });

  return lines.join('\n');
}

function formatStatusMessage(snapshot: Awaited<ReturnType<typeof getTelegramStatusSnapshot>>): string {
  const lines = [
    snapshot.publishingPaused ? '⏸️ Publikacje wstrzymane (/resume żeby wznowić).' : '▶️ Publikacje aktywne.',
    `Zaplanowane: ${snapshot.pendingCount}${snapshot.nextScheduledFor ? ` (najbliższa: ${snapshot.nextScheduledFor.toLocaleString('pl-PL')})` : ''}`,
    `Szkice czekające na decyzję: ${snapshot.draftCount}`,
    `Opublikowane w ostatnich 7 dniach: ${snapshot.recentSuccess}`,
    snapshot.activeCampaignName
      ? `🎯 Aktywna kampania: ${snapshot.activeCampaignName} (nowe posty trafiają tu automatycznie)`
      : '🎯 Brak aktywnej kampanii (/campaign <nazwa> żeby zacząć)',
    snapshot.autopilotEnabled
      ? '🤖 Autopilot: włączony (/autopilot off żeby wyłączyć)'
      : '🤖 Autopilot: wyłączony (/autopilot on żeby włączyć)',
  ];

  if (snapshot.recentFailed.length > 0) {
    lines.push('');
    lines.push('Ostatnie błędy:');
    snapshot.recentFailed.forEach((job) => {
      lines.push(`❌ ${job.platform} (${job.id}): ${job.errorMessage ?? 'nieznany błąd'}`);
    });
  }

  return lines.join('\n');
}

async function handleTextCommand(chatIdStr: string, userId: string, text: string): Promise<boolean> {
  const trimmed = text.trim();

  if (trimmed === '/status') {
    const snapshot = await getTelegramStatusSnapshot(userId);
    await sendTelegramMessage(chatIdStr, formatStatusMessage(snapshot)).catch((error) =>
      logError('telegram', 'send-status-failed', error, { chatId: chatIdStr }),
    );
    return true;
  }

  if (trimmed === '/pause') {
    await setPublishingPaused(userId, true);
    await sendTelegramMessage(chatIdStr, '⏸️ Publikacje wstrzymane. Nic nie zostanie opublikowane, dopóki nie wyślesz /resume.').catch(
      (error) => logError('telegram', 'send-pause-confirmation-failed', error, { chatId: chatIdStr }),
    );
    return true;
  }

  if (trimmed === '/resume') {
    await setPublishingPaused(userId, false);
    await sendTelegramMessage(chatIdStr, '▶️ Publikacje wznowione.').catch((error) =>
      logError('telegram', 'send-resume-confirmation-failed', error, { chatId: chatIdStr }),
    );
    return true;
  }

  // Autopilot (2026-09-14): opt-in, off by default - "brak reakcji = nie publikuj" stays true for
  // every account that hasn't explicitly typed /autopilot on. When on, a new upload skips the
  // manual "Publikuj" tap and auto-schedules at the data-driven optimal time per platform (see
  // handleIncomingMedia), unless a critical safety flag or a not-yet-ready platform requires a
  // human anyway - falls back to the normal preview in that case, per platform.
  const autopilotMatch = trimmed.match(/^\/autopilot(?:\s+(on|off|status))?$/i);
  if (autopilotMatch) {
    const arg = autopilotMatch[1]?.toLowerCase();

    if (!arg || arg === 'status') {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { autopilotEnabled: true } });
      await sendTelegramMessage(
        chatIdStr,
        user?.autopilotEnabled
          ? '🤖 Autopilot: włączony. Nowy materiał publikuje się/planuje automatycznie bez pytania o zgodę.'
          : '🤖 Autopilot: wyłączony. Każdy nowy materiał czeka na Twoje zatwierdzenie jak dotychczas. Włącz przez /autopilot on.',
      ).catch((error) => logError('telegram', 'send-autopilot-status-failed', error, { chatId: chatIdStr }));
      return true;
    }

    await prisma.user.update({ where: { id: userId }, data: { autopilotEnabled: arg === 'on' } });
    await sendTelegramMessage(
      chatIdStr,
      arg === 'on'
        ? '🤖 Autopilot włączony. Nowy materiał od teraz zaplanuje się automatycznie o najlepszej porze per platforma, bez pytania o zgodę - poza sytuacjami wymagającymi ręcznej decyzji (np. wykryte ryzyko w treści). Wyłączysz przez /autopilot off.'
        : '🤖 Autopilot wyłączony. Wracamy do zatwierdzania każdego posta ręcznie.',
    ).catch((error) => logError('telegram', 'send-autopilot-toggle-failed', error, { chatId: chatIdStr }));
    return true;
  }

  const approveMatch = trimmed.match(/^\/approve\s+(\S+)/i);
  if (approveMatch) {
    // UX: triggerPublishJob actually publishes synchronously (video upload to the platform,
    // possibly a multi-step protocol like Facebook Reels) - without this, the chat goes silent
    // for however long that takes, same gap as the media-upload ack above.
    await sendTelegramMessage(chatIdStr, '⏳ Publikuję...').catch((error) =>
      logError('telegram', 'send-approve-ack-failed', error, { chatId: chatIdStr }),
    );
    const result = await triggerPublishJob(userId, approveMatch[1]);
    await sendTelegramMessage(
      chatIdStr,
      result.ok ? `✅ Zatwierdzono. Status: ${result.immediateOutcome}.` : `Nie udało się zatwierdzić: ${result.error}`,
    ).catch((error) => logError('telegram', 'send-approve-result-failed', error, { chatId: chatIdStr }));
    return true;
  }

  // /cancel jest aliasem /reject - cancelPublishJob obsługuje już każdy status poza
  // SUCCESS/FAILED/CANCELED (DRAFT, PENDING, RUNNING), więc "odrzuć szkic" i "anuluj
  // zaplanowany post" to dokładnie ta sama operacja, tylko inne słowo pasuje do intencji
  // użytkownika w danym momencie.
  const rejectMatch = trimmed.match(/^\/(?:reject|cancel)\s+(\S+)/i);
  if (rejectMatch) {
    const result = await cancelPublishJob(userId, rejectMatch[1]);
    await sendTelegramMessage(
      chatIdStr,
      result.ok ? '❌ Odrzucono/anulowano.' : `Nie udało się odrzucić/anulować: ${result.error}`,
    ).catch((error) => logError('telegram', 'send-reject-result-failed', error, { chatId: chatIdStr }));
    return true;
  }

  const retryMatch = trimmed.match(/^\/retry\s+(\S+)/i);
  if (retryMatch) {
    // UX: same reasoning as /approve above - retryPublishJob publishes synchronously.
    await sendTelegramMessage(chatIdStr, '⏳ Ponawiam...').catch((error) =>
      logError('telegram', 'send-retry-ack-failed', error, { chatId: chatIdStr }),
    );
    const result = await retryPublishJob(userId, retryMatch[1]);
    await sendTelegramMessage(
      chatIdStr,
      result.ok ? `🔁 Ponowiono. Status: ${result.immediateOutcome}.` : `Nie udało się ponowić: ${result.error}`,
    ).catch((error) => logError('telegram', 'send-retry-result-failed', error, { chatId: chatIdStr }));
    return true;
  }

  if (trimmed === '/logs') {
    const entries = await getRecentActivityForUser(userId);
    await sendTelegramMessage(chatIdStr, formatActivityMessage(entries)).catch((error) =>
      logError('telegram', 'send-logs-failed', error, { chatId: chatIdStr }),
    );
    return true;
  }

  if (trimmed === '/pomysl') {
    // On-demand only (never proactive/automatic) - grounded in the user's own recently
    // PUBLISHED posts, not generic advice and not based on engagement metrics (we don't yet
    // claim to know "what performed well", only "what was posted" - see lib/server/post-metrics.ts
    // for the separate, still-early metrics-collection work).
    const MIN_POSTS_FOR_IDEAS = 2;
    const [recentPosts, dbUser] = await Promise.all([
      getRecentContentForIdeas(userId),
      prisma.user.findUnique({ where: { id: userId }, select: { businessDescription: true } }),
    ]);

    if (recentPosts.length < MIN_POSTS_FOR_IDEAS) {
      await sendTelegramMessage(
        chatIdStr,
        'Za mało opublikowanych postów, żebym mógł rozpoznać Twój styl - wrzuć jeszcze kilka materiałów, a potem spróbuj /pomysl ponownie.',
      ).catch((error) => logError('telegram', 'send-pomysl-too-few-failed', error, { chatId: chatIdStr }));
      return true;
    }

    await sendTelegramMessage(chatIdStr, '💡 Analizuję Twoje ostatnie posty...').catch((error) =>
      logError('telegram', 'send-pomysl-ack-failed', error, { chatId: chatIdStr }),
    );

    const ideas = await generateContentIdeas(dbUser?.businessDescription ?? null, recentPosts);

    await sendTelegramMessage(
      chatIdStr,
      ideas ? formatContentIdeasMessage(ideas) : 'Nie udało się teraz wygenerować pomysłów - spróbuj ponownie za chwilę.',
    ).catch((error) => logError('telegram', 'send-pomysl-result-failed', error, { chatId: chatIdStr }));
    return true;
  }

  // EPIC 5 (Monetyzacja, zakres tej sesji - patrz komentarz przy modelu Fan w schema.prisma):
  // /fan i /sale to RĘCZNA rejestracja przez twórcę, nie automatyczny checkout - appka nie ma
  // (i nie może sama założyć) konta procesora płatności należącego do twórcy.
  const fanMatch = trimmed.match(/^\/fan\s+(\S+)(?:\s+(.+))?$/i);
  if (fanMatch) {
    const [, email, name] = fanMatch;
    if (!isValidEmail(email)) {
      await sendTelegramMessage(chatIdStr, 'Nieprawidłowy adres email. Użycie: /fan email@przyklad.com [Imię]').catch(
        (error) => logError('telegram', 'send-fan-invalid-email-failed', error, { chatId: chatIdStr }),
      );
      return true;
    }

    const fan = await addFan(userId, email, name);
    await sendTelegramMessage(chatIdStr, `✅ Dodano fana: ${fan.email}${fan.name ? ` (${fan.name})` : ''}.`).catch(
      (error) => logError('telegram', 'send-fan-added-failed', error, { chatId: chatIdStr }),
    );
    return true;
  }

  if (trimmed === '/fans') {
    const [count, recent] = await Promise.all([getFanCount(userId), getRecentFans(userId)]);
    const lines = [`👥 Fani: ${count}`];

    if (recent.length > 0) {
      lines.push('', 'Ostatnio dodani:');
      recent.forEach((fan) => lines.push(`- ${fan.email}${fan.name ? ` (${fan.name})` : ''}`));
    }

    await sendTelegramMessage(chatIdStr, lines.join('\n')).catch((error) =>
      logError('telegram', 'send-fans-failed', error, { chatId: chatIdStr }),
    );
    return true;
  }

  const saleMatch = trimmed.match(/^\/sale\s+(\S+)\s+(.+)$/i);
  if (saleMatch) {
    const [, rawAmount, product] = saleMatch;
    const amountCents = parseAmountToCents(rawAmount);

    if (amountCents === null) {
      await sendTelegramMessage(chatIdStr, 'Nieprawidłowa kwota. Użycie: /sale 80 Koszulka czarna M').catch((error) =>
        logError('telegram', 'send-sale-invalid-amount-failed', error, { chatId: chatIdStr }),
      );
      return true;
    }

    const sale = await recordSale(userId, product, amountCents);
    await sendTelegramMessage(
      chatIdStr,
      `💰 Zapisano sprzedaż: ${sale.product} — ${(amountCents / 100).toFixed(2)} ${sale.currency}.`,
    ).catch((error) => logError('telegram', 'send-sale-recorded-failed', error, { chatId: chatIdStr }));
    return true;
  }

  if (trimmed === '/revenue') {
    const summary = await getRevenueSummary(userId);
    const lines = [
      '💰 Przychód (dane rejestrowane ręcznie przez /sale - jeszcze bez automatycznego checkoutu):',
      '',
      `Fani: ${summary.fanCount}`,
      `Sprzedaże w tym miesiącu: ${summary.thisMonthSalesCount} (${(summary.thisMonthRevenueCents / 100).toFixed(2)} PLN)`,
      `Sprzedaże łącznie: ${summary.allTimeSalesCount} (${(summary.allTimeRevenueCents / 100).toFixed(2)} PLN)`,
      '',
      'Dodaj fana: /fan email@przyklad.com [Imię]  •  Zapisz sprzedaż: /sale 80 Koszulka czarna M',
    ];
    await sendTelegramMessage(chatIdStr, lines.join('\n')).catch((error) =>
      logError('telegram', 'send-revenue-failed', error, { chatId: chatIdStr }),
    );
    return true;
  }

  // Real coaching (2026-09-14): free-text goal, same philosophy as businessDescription - let the
  // LLM/coach handle nuance instead of forcing a rigid metric structure.
  const goalMatch = trimmed.match(/^\/goal\s+(.+)$/i);
  if (goalMatch) {
    const goal = await setGoal(userId, goalMatch[1]);
    await sendTelegramMessage(chatIdStr, `🎯 Zapisano cel: ${goal.description}\n\nID: ${goal.id} (użyj /goal-done ${goal.id}, gdy go zrealizujesz)`).catch(
      (error) => logError('telegram', 'send-goal-added-failed', error, { chatId: chatIdStr }),
    );
    return true;
  }

  if (trimmed === '/goals') {
    const goals = await getActiveGoals(userId);
    const lines =
      goals.length === 0
        ? ['🎯 Brak aktywnych celów. Dodaj: /goal np. Publikować 3x w tygodniu']
        : ['🎯 Aktywne cele:', '', ...goals.map((goal) => `- ${goal.description} (ID: ${goal.id})`)];

    await sendTelegramMessage(chatIdStr, lines.join('\n')).catch((error) =>
      logError('telegram', 'send-goals-failed', error, { chatId: chatIdStr }),
    );
    return true;
  }

  const goalDoneMatch = trimmed.match(/^\/goal-done\s+(\S+)/i);
  if (goalDoneMatch) {
    const result = await completeGoal(userId, goalDoneMatch[1]);
    await sendTelegramMessage(
      chatIdStr,
      result.ok ? `✅ Cel zrealizowany: ${result.goal.description}` : `Nie udało się: ${result.error}`,
    ).catch((error) => logError('telegram', 'send-goal-done-failed', error, { chatId: chatIdStr }));
    return true;
  }

  // Campaigns (2026-09-14): starting one auto-attaches every subsequent post with zero extra
  // step per upload (attachActiveCampaignToJobs, wired into createDraftGroupForVideo) - see
  // lib/server/campaigns.ts for the full "active campaign" reasoning.
  const campaignMatch = trimmed.match(/^\/campaign\s+(.+)$/i);
  if (campaignMatch) {
    const result = await startCampaign(userId, campaignMatch[1]);
    const lines = [`🎯 Kampania "${result.campaign.name}" aktywna. Każdy kolejny post trafi tu automatycznie, dopóki nie wpiszesz /campaign-end.`];
    if (result.endedPrevious) {
      lines.push(`(Zakończono poprzednią aktywną kampanię: "${result.endedPrevious.name}")`);
    }
    await sendTelegramMessage(chatIdStr, lines.join('\n')).catch((error) =>
      logError('telegram', 'send-campaign-started-failed', error, { chatId: chatIdStr }),
    );
    return true;
  }

  if (trimmed === '/campaign-end') {
    const ended = await endActiveCampaign(userId);
    await sendTelegramMessage(
      chatIdStr,
      ended
        ? `✅ Zakończono kampanię "${ended.name}". Zobacz wyniki: /campaign-report ${ended.name}`
        : 'Nie masz aktywnej kampanii.',
    ).catch((error) => logError('telegram', 'send-campaign-end-failed', error, { chatId: chatIdStr }));
    return true;
  }

  if (trimmed === '/campaigns') {
    const campaigns = await listRecentCampaigns(userId);
    const lines =
      campaigns.length === 0
        ? ['🎯 Brak kampanii jeszcze. Zacznij: /campaign np. Premiera singla']
        : [
            '🎯 Kampanie:',
            '',
            ...campaigns.map((campaign) => `- ${campaign.name} (${campaign.endedAt ? 'zakończona' : 'aktywna'})`),
          ];
    await sendTelegramMessage(chatIdStr, lines.join('\n')).catch((error) =>
      logError('telegram', 'send-campaigns-failed', error, { chatId: chatIdStr }),
    );
    return true;
  }

  const campaignReportMatch = trimmed.match(/^\/campaign-report(?:\s+(.+))?$/i);
  if (campaignReportMatch) {
    const nameOrId = campaignReportMatch[1]?.trim();
    const target = nameOrId || (await getActiveCampaign(userId))?.name;

    if (!target) {
      await sendTelegramMessage(chatIdStr, 'Podaj nazwę kampanii: /campaign-report Premiera singla (albo zacznij jedną: /campaign).').catch(
        (error) => logError('telegram', 'send-campaign-report-missing-name-failed', error, { chatId: chatIdStr }),
      );
      return true;
    }

    const result = await getCampaignReport(userId, target);
    await sendTelegramMessage(chatIdStr, result.ok ? formatCampaignReportMessage(result.report) : result.error).catch(
      (error) => logError('telegram', 'send-campaign-report-failed', error, { chatId: chatIdStr }),
    );
    return true;
  }

  // EPIC 11 Sprint 11.1: zero nowych zgód OAuth - patrz lib/server/account-growth.ts.
  if (trimmed === '/followers') {
    const growth = await getFollowerGrowth(userId);
    await sendTelegramMessage(chatIdStr, formatFollowerGrowthMessage(growth)).catch((error) =>
      logError('telegram', 'send-followers-failed', error, { chatId: chatIdStr }),
    );
    return true;
  }

  return false;
}

function formatFollowerGrowthMessage(growth: FollowerGrowthEntry[]): string {
  if (growth.length === 0) {
    return '📈 Brak jeszcze wystarczających danych o obserwujących - wróć jutro, appka zbiera je raz dziennie.';
  }

  const lines = ['📈 Wzrost obserwujących:'];
  growth.forEach((entry) => {
    const delta = entry.weekAgo !== null ? entry.current - entry.weekAgo : null;
    const deltaLabel =
      delta === null
        ? 'brak jeszcze wystarczających danych'
        : delta === 0
          ? 'bez zmian w tym tygodniu'
          : `${delta > 0 ? '+' : ''}${delta} w tym tygodniu`;
    lines.push(`${entry.platform}: ${entry.current} (${deltaLabel})`);
  });

  return lines.join('\n');
}

function formatCampaignReportMessage(report: CampaignReport): string {
  const status = report.endedAt ? `zakończona ${report.endedAt.toLocaleDateString('pl-PL')}` : 'wciąż aktywna';
  const lines = [
    `📊 Kampania "${report.name}" (${status})`,
    '',
    `Publikacje: ${report.postsCount}${report.platforms.length > 0 ? ` (${report.platforms.join(', ')})` : ''}`,
    `Wyświetlenia: ${report.totalViews}`,
    `Polubienia: ${report.totalLikes} • Komentarze: ${report.totalComments} • Udostępnienia: ${report.totalShares}`,
  ];

  if (report.engagementRate !== null) {
    lines.push(`Engagement rate: ${(report.engagementRate * 100).toFixed(1)}%`);
  }
  if (report.newFans > 0) {
    lines.push(`Nowi fani w tym czasie: ${report.newFans}`);
  }
  if (report.salesCents > 0) {
    lines.push(`Sprzedaże w tym czasie: ${(report.salesCents / 100).toFixed(2)} PLN`);
  }

  return lines.join('\n');
}

function formatPublishResultMessage(
  publishJobs: Array<{ status: string; remotePostUrl: string | null; socialAccount: { platform: string } }>,
): string {
  const lines = publishJobs.map((job) => {
    if (job.status === 'SUCCESS') {
      return job.remotePostUrl
        ? `✅ ${job.socialAccount.platform}: ${job.remotePostUrl}`
        : `✅ ${job.socialAccount.platform}: opublikowano (link niedostępny z API tej platformy)`;
    }

    if (job.status === 'PENDING') {
      // TikTok (i czasem inne platformy) publikuje asynchronicznie - w tym momencie żądania
      // wciąż trwa przetwarzanie w tle (cron sprawdza status co minutę), link pojawi się
      // dopiero po zakończeniu. Prywatne posty (np. TikTok SELF_ONLY) mogą nie mieć w ogóle
      // publicznego linku - patrz docs/postfly-instrukcja-startu.md po jak to zmienić.
      return `⏳ ${job.socialAccount.platform}: w trakcie przetwarzania - sprawdź panel Postfly za chwilę.`;
    }

    return `❌ ${job.socialAccount.platform}: ${job.status}`;
  });

  return lines.join('\n');
}

// EPIC 11 Sprint 11.2: the three button actions on a detected-comment alert
// (commentreply/commentcustom/commentignore in detectAndNotifyNewComments). Edits the original
// alert message to reflect the outcome, mirroring how toggle/cancel edit their own message rather
// than sending a new one.
async function handleCommentCallback(
  action: string,
  commentId: string,
  userId: string,
  chatIdStr: string,
  messageId: number,
  callbackQueryId: string,
) {
  if (action === 'commentreply') {
    const result = await acceptSuggestedReply(commentId, userId);
    await answerTelegramCallbackQuery(callbackQueryId, result.ok ? 'Wysłano.' : result.error).catch(() => {});
    if (result.ok) {
      await editTelegramMessage(chatIdStr, messageId, '✅ Odpowiedź wysłana.').catch((error) =>
        logError('telegram', 'edit-comment-reply-failed', error, { chatId: chatIdStr }),
      );
    }
    return;
  }

  if (action === 'commentignore') {
    const result = await ignoreComment(commentId, userId);
    await answerTelegramCallbackQuery(callbackQueryId, result.ok ? 'Zignorowano.' : result.error).catch(() => {});
    if (result.ok) {
      await editTelegramMessage(chatIdStr, messageId, '🚫 Zignorowano.').catch((error) =>
        logError('telegram', 'edit-comment-ignore-failed', error, { chatId: chatIdStr }),
      );
    }
    return;
  }

  // commentcustom: starts the same free-text-turn pattern as editstart/schedulestart - the next
  // non-slash message from this user is sent verbatim as the reply (see handleCommentReplyText).
  await prisma.user.update({ where: { id: userId }, data: { telegramReplyingToCommentId: commentId } });
  await answerTelegramCallbackQuery(callbackQueryId).catch(() => {});
  await sendTelegramMessage(chatIdStr, 'Wyślij treść odpowiedzi na ten komentarz jedną wiadomością.').catch((error) =>
    logError('telegram', 'send-comment-custom-prompt-failed', error, { chatId: chatIdStr }),
  );
}

async function handleCallbackQuery(update: NonNullable<TelegramUpdate['callback_query']>) {
  const chatId = update.message?.chat?.id;
  const messageId = update.message?.message_id;
  const data = update.data;

  if (chatId === undefined || chatId === null || !data || messageId === undefined) {
    await answerTelegramCallbackQuery(update.id).catch(() => {});
    return;
  }

  const chatIdStr = String(chatId);
  const [action, postGroupId, toggleTarget] = data.split(':');

  const linkedUser = await findUserByTelegramChatId(chatIdStr);
  if (!linkedUser) {
    await answerTelegramCallbackQuery(update.id, 'To konto nie jest połączone.').catch(() => {});
    return;
  }

  // EPIC 11 Sprint 11.2: comment actions carry a SocialComment id in the same data-field position
  // as postGroupId (action:id) - handled before the postGroupId ownership gate below, since that
  // gate assumes a PublishJob group id, not a comment id. Ownership is checked inside each helper
  // (SocialComment.userId === linkedUser.id), same "never touch another user's row" guarantee.
  if (action === 'commentreply' || action === 'commentcustom' || action === 'commentignore') {
    await handleCommentCallback(action, postGroupId, linkedUser.id, chatIdStr, messageId, update.id);
    return;
  }

  // Bramka bezpieczeństwa: nawet jeśli chatId jest powiązany z jakimś kontem, akcja może
  // dotyczyć tylko postGroupId należącego do TEGO SAMEGO użytkownika - nigdy cudzego zadania.
  const ownsGroup = await prisma.publishJob.findFirst({
    where: { postGroupId, video: { userId: linkedUser.id } },
    select: { id: true },
  });

  if (!ownsGroup) {
    await answerTelegramCallbackQuery(update.id, 'Nie znaleziono tego posta.').catch(() => {});
    return;
  }

  if (action === 'cancel') {
    await prisma.publishJob.deleteMany({ where: { postGroupId, status: 'DRAFT', video: { userId: linkedUser.id } } });
    await answerTelegramCallbackQuery(update.id, 'Anulowano.').catch(() => {});
    await editTelegramMessage(chatIdStr, messageId, 'Post anulowany.').catch((error) =>
      logError('telegram', 'edit-message-cancel-failed', error, { chatId: chatIdStr }),
    );
    return;
  }

  if (action === 'toggle') {
    if (!toggleTarget || !VALID_TOGGLE_PLATFORMS.includes(toggleTarget)) {
      await answerTelegramCallbackQuery(update.id, 'Nieprawidłowa platforma.').catch(() => {});
      return;
    }

    const targetJob = await prisma.publishJob.findFirst({
      where: { postGroupId, status: 'DRAFT', video: { userId: linkedUser.id }, socialAccount: { platform: toggleTarget as never } },
    });

    if (!targetJob) {
      await answerTelegramCallbackQuery(update.id, 'Nie znaleziono tej platformy dla tego posta.').catch(() => {});
      return;
    }

    const toggled = await prisma.publishJob.update({
      where: { id: targetJob.id },
      data: { excludedFromPublish: !targetJob.excludedFromPublish },
    });

    const allJobs = await prisma.publishJob.findMany({
      where: { postGroupId, status: 'DRAFT', video: { userId: linkedUser.id } },
      include: { socialAccount: true, video: true },
      orderBy: { createdAt: 'asc' },
    });

    await answerTelegramCallbackQuery(
      update.id,
      toggled.excludedFromPublish ? `Pominięto ${toggleTarget}.` : `${toggleTarget} z powrotem w publikacji.`,
    ).catch(() => {});

    await editTelegramMessage(
      chatIdStr,
      messageId,
      buildPreviewMessage(allJobs),
      buildPreviewButtons(postGroupId, allJobs),
    ).catch((error) => logError('telegram', 'edit-message-toggle-failed', error, { chatId: chatIdStr }));
    return;
  }

  if (action === 'formattoggle') {
    if (!toggleTarget || (toggleTarget !== 'FACEBOOK' && toggleTarget !== 'INSTAGRAM')) {
      await answerTelegramCallbackQuery(update.id, 'Nieprawidłowa platforma.').catch(() => {});
      return;
    }

    const targetJob = await prisma.publishJob.findFirst({
      where: { postGroupId, status: 'DRAFT', video: { userId: linkedUser.id }, socialAccount: { platform: toggleTarget } },
      include: { video: true },
    });

    if (!targetJob) {
      await answerTelegramCallbackQuery(update.id, 'Nie znaleziono tej platformy dla tego posta.').catch(() => {});
      return;
    }

    if (targetJob.video.mediaType !== 'VIDEO') {
      await answerTelegramCallbackQuery(update.id, 'Format Reels/post dotyczy tylko wideo.').catch(() => {});
      return;
    }

    // Facebook cycles through all three (Reels and a plain post are genuinely separate surfaces
    // there, so "Oba" = two real publications - see enqueueDraftGroup). Instagram stays a
    // two-way toggle: a Reel there already reaches the feed too (share_to_feed), so a separate
    // "Oba" would just be a literal duplicate post, not a second real placement.
    const nextFormat =
      toggleTarget === 'FACEBOOK'
        ? targetJob.metaPostFormat === 'REELS' || !targetJob.metaPostFormat
          ? 'FEED'
          : targetJob.metaPostFormat === 'FEED'
            ? 'BOTH'
            : 'REELS'
        : targetJob.metaPostFormat === 'FEED'
          ? 'REELS'
          : 'FEED';

    await prisma.publishJob.update({ where: { id: targetJob.id }, data: { metaPostFormat: nextFormat } });
    // Same sticky-default write-through PATCH .../drafts/:id already does for the web composer -
    // a choice made here should stick for the next post on this account too, on either channel.
    await prisma.socialAccount
      .update({ where: { id: targetJob.socialAccountId }, data: { lastMetaPostFormat: nextFormat } })
      .catch((error) => logError('telegram', 'persist-sticky-meta-format-failed', error, { chatId: chatIdStr }));

    const allJobs = await prisma.publishJob.findMany({
      where: { postGroupId, status: 'DRAFT', video: { userId: linkedUser.id } },
      include: { socialAccount: true, video: true },
      orderBy: { createdAt: 'asc' },
    });

    const confirmationText =
      nextFormat === 'FEED' ? `${toggleTarget}: zwykły post.` : nextFormat === 'BOTH' ? `${toggleTarget}: oba (Reels + post).` : `${toggleTarget}: Reels.`;
    await answerTelegramCallbackQuery(update.id, confirmationText).catch(() => {});

    await editTelegramMessage(
      chatIdStr,
      messageId,
      buildPreviewMessage(allJobs),
      buildPreviewButtons(postGroupId, allJobs),
    ).catch((error) => logError('telegram', 'edit-message-formattoggle-failed', error, { chatId: chatIdStr }));
    return;
  }

  if (action === 'editstart') {
    if (!toggleTarget || !VALID_TOGGLE_PLATFORMS.includes(toggleTarget)) {
      await answerTelegramCallbackQuery(update.id, 'Nieprawidłowa platforma.').catch(() => {});
      return;
    }

    const targetJob = await prisma.publishJob.findFirst({
      where: { postGroupId, status: 'DRAFT', video: { userId: linkedUser.id }, socialAccount: { platform: toggleTarget as never } },
    });

    if (!targetJob) {
      await answerTelegramCallbackQuery(update.id, 'Nie znaleziono tej platformy dla tego posta.').catch(() => {});
      return;
    }

    await prisma.user.update({ where: { id: linkedUser.id }, data: { telegramEditingJobId: targetJob.id } });
    await answerTelegramCallbackQuery(update.id).catch(() => {});

    const isYoutube = toggleTarget === 'YOUTUBE';
    const currentHashtags = targetJob.hashtags.length > 0 ? targetJob.hashtags.map((tag) => `#${tag}`).join(' ') : '(brak)';
    const currentTitleLine = isYoutube ? `Tytuł: ${targetJob.title ?? '(brak)'}\n` : '';

    await sendTelegramMessage(
      chatIdStr,
      `Edytujesz ${toggleTarget}.\n\nAktualnie:\n${currentTitleLine}Opis: ${targetJob.caption}\nHashtagi: ${currentHashtags}\n\n` +
        `Wyślij nową treść jedną wiadomością${isYoutube ? ' (pierwsza linia = tytuł, jeśli go zmieniasz, potem opis)' : ''}. ` +
        'Hashtagi dopisz na końcu, zaczynając od #. Możesz zostawić coś bez zmian - po prostu tego nie pisz.',
    ).catch((error) => logError('telegram', 'send-edit-prompt-failed', error, { chatId: chatIdStr }));
    return;
  }

  if (action === 'schedulestart') {
    await prisma.user.update({ where: { id: linkedUser.id }, data: { telegramSchedulingPostGroupId: postGroupId } });
    await answerTelegramCallbackQuery(update.id).catch(() => {});

    await sendTelegramMessage(
      chatIdStr,
      'Kiedy opublikować? Wyślij termin jedną wiadomością, np.:\n"za 30 minut"\n"jutro 19:00"\n"20.09.2026 19:00"\n\n' +
        'Godziny w czasie polskim (Europe/Warsaw).',
    ).catch((error) => logError('telegram', 'send-schedule-prompt-failed', error, { chatId: chatIdStr }));
    return;
  }

  if (action === 'scheduleoptimal') {
    // Feedback loop (2026-09-14): the one-tap version of reading "💡 Sugerowana pora" and typing
    // a matching date into "📅 Zaplanuj" - each platform gets scheduled at ITS OWN suggested time
    // (see enqueueDraftGroupOptimally), not one shared time for the whole post.
    const result = await enqueueDraftGroupOptimally(linkedUser.id, postGroupId);

    if (!result.ok) {
      await answerTelegramCallbackQuery(update.id, result.error).catch(() => {});
      return;
    }

    if (result.scheduled.length === 0) {
      await answerTelegramCallbackQuery(update.id, 'Nie ma czego zaplanować (wszystko odznaczone albo jeszcze nie gotowe).').catch(() => {});
      return;
    }

    await answerTelegramCallbackQuery(update.id, 'Zaplanowano optymalnie.').catch(() => {});
    await editTelegramMessage(chatIdStr, messageId, formatAutopilotScheduledMessage(result.scheduled)).catch((error) =>
      logError('telegram', 'edit-message-scheduleoptimal-failed', error, { chatId: chatIdStr }),
    );

    if (result.skippedPlatforms.length > 0) {
      const remainingJobs = await prisma.publishJob.findMany({
        where: { postGroupId, status: 'DRAFT', video: { userId: linkedUser.id } },
        include: { socialAccount: true, video: true },
      });

      if (remainingJobs.length > 0) {
        await sendTelegramMessageWithButtons(
          chatIdStr,
          `⚠️ ${result.skippedPlatforms.join(', ')} wymaga ręcznej akceptacji:\n\n${buildPreviewMessage(remainingJobs)}`,
          buildPreviewButtons(postGroupId, remainingJobs),
        ).catch((error) => logError('telegram', 'send-scheduleoptimal-remainder-failed', error, { chatId: chatIdStr }));
      }
    }

    return;
  }

  if (action === 'publish') {
    const draftJobs = await prisma.publishJob.findMany({
      where: { postGroupId, status: 'DRAFT', video: { userId: linkedUser.id } },
      include: { socialAccount: true },
    });
    const targetPlatforms = draftJobs.filter((job) => !job.excludedFromPublish).map((job) => job.socialAccount.platform);

    if (targetPlatforms.length === 0) {
      await answerTelegramCallbackQuery(update.id, 'Wszystkie platformy odznaczone - nie ma czego opublikować.').catch(() => {});
      return;
    }

    // UX: answering the callback query early clears the button's native loading spinner, which
    // on its own is easy to miss - editing the message text to something explicit is a much
    // clearer signal that the (possibly multi-platform, possibly slow) publish is under way.
    await answerTelegramCallbackQuery(update.id).catch(() => {});
    await editTelegramMessage(chatIdStr, messageId, '⏳ Publikuję...').catch((error) =>
      logError('telegram', 'edit-message-publish-ack-failed', error, { chatId: chatIdStr }),
    );

    const result = await enqueueDraftGroup(linkedUser.id, {
      postGroupId,
      publishNow: true,
      tiktokPostingConsent: targetPlatforms.includes('TIKTOK'),
      targetPlatforms,
    });

    if (!result.ok) {
      await editTelegramMessage(chatIdStr, messageId, `Nie udało się opublikować: ${result.error}`).catch((error) =>
        logError('telegram', 'edit-message-publish-error-failed', error, { chatId: chatIdStr }),
      );
      return;
    }

    await editTelegramMessage(
      chatIdStr,
      messageId,
      `Wynik publikacji:\n\n${formatPublishResultMessage(result.publishJobs)}`,
    ).catch((error) => logError('telegram', 'edit-message-publish-success-failed', error, { chatId: chatIdStr }));
    return;
  }

  await answerTelegramCallbackQuery(update.id).catch(() => {});
}

// TASK-1.3.4: one requestId per incoming webhook call, automatically attached to every
// logEvent/logError emitted anywhere in the chain this triggers (media download, draft
// creation, immediate publish attempts, platform API calls) via AsyncLocalStorage - see
// lib/server/request-context.ts.
export async function POST(request: NextRequest) {
  return runWithRequestId(() => handlePost(request));
}

async function handlePost(request: NextRequest) {
  // TASK-3.1.1 / sekcja 9.3: weryfikacja podpisu PRZED jakimkolwiek przetwarzaniem treści -
  // pierwszy webhook w projekcie, ustawia precedens dla TASK-1.5.1. Treść wiadomości Telegram
  // to zawsze dane wejściowe do oceny, nigdy polecenie do bezpośredniego wykonania (sekcja 9.1).
  if (!verifyTelegramWebhookSecret(request)) {
    return unauthorized('Invalid webhook secret');
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Every other mutating route in this app (publish-jobs trigger/retry/enqueue) already rate
  // limits - this webhook never did. That gap mattered less before the agent-mentor existed;
  // now unrecognized free text triggers up to 3 paid Claude calls per message with nothing
  // stopping a runaway loop or spam. Keyed per chat (works even before /start linking), checked
  // before ANY other work so a blocked burst never reaches a command handler or the mentor.
  const rateLimitChatId = resolveRateLimitChatId(update);
  if (rateLimitChatId) {
    const rateLimit = await consumeRateLimit({
      key: `telegram-webhook:${rateLimitChatId}`,
      limit: 30,
      windowMs: 5 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      await sendTelegramMessage(rateLimitChatId, 'Zbyt wiele wiadomości w krótkim czasie - spróbuj ponownie za chwilę.').catch(
        (error) => logError('telegram', 'send-rate-limit-notice-failed', error, { chatId: rateLimitChatId }),
      );
      return NextResponse.json({ ok: true });
    }
  }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  const text = update.message?.text;

  if (chatId === undefined || chatId === null) {
    return NextResponse.json({ ok: true });
  }

  const chatIdStr = String(chatId);

  if (text) {
    const startMatch = text.match(START_COMMAND_PATTERN);
    if (startMatch) {
      await handleStartCommand(chatIdStr, startMatch[1]);
      return NextResponse.json({ ok: true });
    }
  }

  // TASK-3.1.2: wideo/zdjęcie od połączonego użytkownika -> tworzy Video + DRAFT-y +
  // podgląd z przyciskami. Routing pozostałych komend tekstowych (/status /pause itd.) to
  // TASK-3.2.1, celowo poza zakresem tego zadania.
  const photo = update.message?.photo;
  const video = update.message?.video;
  const caption = update.message?.caption;

  if (photo?.length || video) {
    const linkedUser = await findUserByTelegramChatId(chatIdStr);
    if (!linkedUser) {
      await sendTelegramMessage(
        chatIdStr,
        'To konto Telegram nie jest jeszcze połączone z żadnym kontem Postfly. Wygeneruj kod w panelu (Ustawienia konta) i wyślij /start <kod>.',
      ).catch((error) => logError('telegram', 'send-not-linked-failed', error, { chatId: chatIdStr }));
      return NextResponse.json({ ok: true });
    }

    if (video) {
      await handleIncomingMedia(chatIdStr, linkedUser.id, { fileId: video.file_id, fileSize: video.file_size, mediaType: 'VIDEO', caption }, linkedUser.autopilotEnabled);
    } else if (photo && photo.length > 0) {
      const largest = photo[photo.length - 1];
      await handleIncomingMedia(chatIdStr, linkedUser.id, { fileId: largest.file_id, fileSize: largest.file_size, mediaType: 'IMAGE', caption }, linkedUser.autopilotEnabled);
    }

    return NextResponse.json({ ok: true });
  }

  if (!text) {
    return NextResponse.json({ ok: true });
  }

  // Każda inna wiadomość: brak powiązania = odrzucona, zero dostępu do jakichkolwiek danych
  // (sekcja 4.1 głównego planu).
  const linkedUser = await findUserByTelegramChatId(chatIdStr);
  if (!linkedUser) {
    await sendTelegramMessage(
      chatIdStr,
      'To konto Telegram nie jest jeszcze połączone z żadnym kontem Postfly. Wygeneruj kod w panelu (Ustawienia konta) i wyślij /start <kod>.',
    ).catch((error) => logError('telegram', 'send-not-linked-failed', error, { chatId: chatIdStr }));
    return NextResponse.json({ ok: true });
  }

  // Onboarding reply takes priority over everything else - it's the very first thing a newly
  // linked account is asked. Same "slash command wins" escape hatch as edit/schedule below,
  // except /skip specifically IS consumed here (it's the designated way to answer "not now").
  if (
    linkedUser.telegramAwaitingBusinessDescription &&
    (!text.trim().startsWith('/') || text.trim().toLowerCase() === '/skip')
  ) {
    await handleBusinessDescriptionReply(chatIdStr, linkedUser.id, text);
    return NextResponse.json({ ok: true });
  }

  // Free-text reply to an in-progress "✏️ Edytuj" prompt (see editstart/handleEditReply) takes
  // priority over the fixed command set - but a slash command always wins even mid-edit, so a
  // user isn't trapped needing to finish or abandon an edit before e.g. checking /status.
  if (linkedUser.telegramEditingJobId && !text.trim().startsWith('/')) {
    await handleEditReply(chatIdStr, linkedUser.id, linkedUser.telegramEditingJobId, text);
    return NextResponse.json({ ok: true });
  }

  // Same priority rule as the edit reply above, for an in-progress "📅 Zaplanuj" prompt.
  if (linkedUser.telegramSchedulingPostGroupId && !text.trim().startsWith('/')) {
    await handleScheduleReply(chatIdStr, linkedUser.id, linkedUser.telegramSchedulingPostGroupId, text);
    return NextResponse.json({ ok: true });
  }

  // EPIC 11 Sprint 11.2: same priority rule, for an in-progress "✏️ Napisz własną" prompt on a
  // detected comment (see commentcustom in handleCallbackQuery).
  if (linkedUser.telegramReplyingToCommentId && !text.trim().startsWith('/')) {
    await handleCommentReplyText(chatIdStr, linkedUser.id, linkedUser.telegramReplyingToCommentId, text);
    return NextResponse.json({ ok: true });
  }

  // TASK-3.2.1: wszystkie komendy z sekcji 5 głównego planu - /status /pause /resume
  // /approve <id> /reject <id> /retry <id> /cancel <id> /logs /revenue, plus /pomysl (pomysły
  // na kolejne nagrania na podstawie własnej historii postów) i EPIC 5 /fan /fans /sale
  // (ręczna rejestracja fanów/sprzedaży).
  const handled = await handleTextCommand(chatIdStr, linkedUser.id, text);

  // Agent-mentor (decyzja PO 2026-09-13): dowolny tekst, który nie pasował do żadnej znanej
  // komendy ani aktywnej sesji, wcześniej ginął w ciszy - teraz trafia do rozmowy z agentem
  // zamiast być ignorowany. Nie konkuruje z istniejącymi komendami (te zawsze wygrywają, bo
  // handleTextCommand jest sprawdzane pierwsze) ani nie zwiększa kosztu istniejących ścieżek.
  if (!handled) {
    await sendTelegramMessage(chatIdStr, '🤔 Myślę...').catch((error) =>
      logError('telegram', 'send-mentor-ack-failed', error, { chatId: chatIdStr }),
    );
    const reply = await runMentorTurn(linkedUser.id, text);
    await sendTelegramMessage(chatIdStr, reply).catch((error) =>
      logError('telegram', 'send-mentor-reply-failed', error, { chatId: chatIdStr }),
    );
  }

  return NextResponse.json({ ok: true });
}
