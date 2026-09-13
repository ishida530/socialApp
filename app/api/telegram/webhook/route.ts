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
  getRecentActivityForUser,
  getRecentContentForIdeas,
  getTelegramStatusSnapshot,
  retryPublishJob,
  triggerPublishJob,
} from '@/lib/server/publish-jobs';
import { generateContentIdeas, type ContentIdea } from '@/lib/server/telegram-content-ideas';
import { prisma } from '@/lib/server/prisma';
import { unauthorized } from '@/lib/server/http';
import { logError, logEvent } from '@/lib/server/observability';
import { runWithRequestId } from '@/lib/server/request-context';
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

function buildPreviewMessage(jobs: PreviewJob[]) {
  const lines = jobs.map(
    (job) => `${job.excludedFromPublish ? '☐' : '✅'} ${job.socialAccount.platform} — ${describePlatformFormat(job)}`,
  );

  return [
    'Materiał odebrany! Oto co przygotowałem:',
    '',
    ...lines,
    '',
    'Odznacz platformę żeby ją pominąć, ✏️ Edytuj żeby poprawić opis/hashtagi/tytuł, 🎬/📋 żeby przełączyć Reels/zwykły post (Facebook/Instagram), potem zatwierdź albo anuluj.',
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

    await sendTelegramMessageWithButtons(
      chatIdStr,
      buildPreviewMessage(draftResult.jobs),
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

  if (trimmed === '/revenue') {
    // Uczciwie: appka dziś nie zbiera żadnych danych o przychodach z treści (EPIC 5
    // Monetyzacja - Fan/Sale/FanSubscription - jeszcze nie istnieje w schemacie). Pokazanie
    // tu danych o subskrypcji Postfly (koszt appki, nie przychód z treści) byłoby mylące pod
    // tą nazwą komendy, więc zamiast tego jawna informacja, że tej funkcji jeszcze nie ma.
    await sendTelegramMessage(
      chatIdStr,
      '💰 Śledzenie przychodów z treści jeszcze nie istnieje w Postfly (moduł Monetyzacji jest w planach, ale niezaimplementowany). Ta komenda zacznie zwracać realne dane, gdy ten moduł powstanie.',
    ).catch((error) => logError('telegram', 'send-revenue-failed', error, { chatId: chatIdStr }));
    return true;
  }

  return false;
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
      await handleIncomingMedia(chatIdStr, linkedUser.id, { fileId: video.file_id, fileSize: video.file_size, mediaType: 'VIDEO', caption });
    } else if (photo && photo.length > 0) {
      const largest = photo[photo.length - 1];
      await handleIncomingMedia(chatIdStr, linkedUser.id, { fileId: largest.file_id, fileSize: largest.file_size, mediaType: 'IMAGE', caption });
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

  // TASK-3.2.1: wszystkie komendy z sekcji 5 głównego planu - /status /pause /resume
  // /approve <id> /reject <id> /retry <id> /cancel <id> /logs /revenue, plus /pomysl (pomysły
  // na kolejne nagrania na podstawie własnej historii postów).
  await handleTextCommand(chatIdStr, linkedUser.id, text);

  return NextResponse.json({ ok: true });
}
