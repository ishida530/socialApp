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
  getTelegramStatusSnapshot,
  triggerPublishJob,
} from '@/lib/server/publish-jobs';
import { prisma } from '@/lib/server/prisma';
import { unauthorized } from '@/lib/server/http';
import { logError, logEvent } from '@/lib/server/observability';

type TelegramPhotoSize = { file_id: string; file_size?: number };
type TelegramVideo = { file_id: string; file_size?: number; mime_type?: string };

type TelegramUpdate = {
  message?: {
    message_id?: number;
    chat?: { id?: number | string };
    text?: string;
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

function buildPreviewButtons(postGroupId: string) {
  return [
    [
      { text: '✅ Publikuj', callback_data: `publish:${postGroupId}` },
      { text: '❌ Anuluj', callback_data: `cancel:${postGroupId}` },
    ],
  ];
}

async function handleStartCommand(chatIdStr: string, code: string) {
  const result = await consumeTelegramLinkCode(code, chatIdStr);

  if (result.status === 'linked') {
    logEvent('telegram', 'account-linked', { userId: result.userId });
    await sendTelegramMessage(
      chatIdStr,
      'Konto Postfly połączone! Wyślij mi wideo albo zdjęcie, a przygotuję dla Ciebie post.',
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
  media: { fileId: string; fileSize?: number; mediaType: 'VIDEO' | 'IMAGE' },
) {
  if (media.fileSize && media.fileSize > TELEGRAM_MAX_DOWNLOADABLE_FILE_BYTES) {
    await sendTelegramMessage(
      chatIdStr,
      'Ten plik jest za duży (limit Telegrama dla botów to 20 MB). Wyślij mniejszy plik albo dodaj materiał przez panel Postfly.',
    ).catch((error) => logError('telegram', 'send-file-too-large-failed', error, { chatId: chatIdStr }));
    return;
  }

  try {
    const video = await uploadTelegramMediaAsVideo(userId, media.fileId, media.mediaType, `Telegram ${new Date().toISOString()}`);
    const draftResult = await createDraftGroupForVideo(userId, video.id);

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

    const platformNames = draftResult.jobs.map((job) => job.socialAccount.platform).join(', ');
    await sendTelegramMessageWithButtons(
      chatIdStr,
      `Materiał odebrany! Przygotowałem post na: ${platformNames}.\n\nZatwierdź publikację albo anuluj — treść możesz doprecyzować w panelu Postfly przed zatwierdzeniem.`,
      buildPreviewButtons(draftResult.postGroupId),
    ).catch((error) => logError('telegram', 'send-preview-failed', error, { chatId: chatIdStr }));
  } catch (error) {
    logError('telegram', 'media-upload-failed', error, { chatId: chatIdStr });
    await sendTelegramMessage(
      chatIdStr,
      'Coś poszło nie tak przy przetwarzaniu materiału. Spróbuj ponownie albo dodaj go przez panel Postfly.',
    ).catch(() => {});
  }
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
    const result = await triggerPublishJob(userId, approveMatch[1]);
    await sendTelegramMessage(
      chatIdStr,
      result.ok ? `✅ Zatwierdzono. Status: ${result.immediateOutcome}.` : `Nie udało się zatwierdzić: ${result.error}`,
    ).catch((error) => logError('telegram', 'send-approve-result-failed', error, { chatId: chatIdStr }));
    return true;
  }

  const rejectMatch = trimmed.match(/^\/reject\s+(\S+)/i);
  if (rejectMatch) {
    const result = await cancelPublishJob(userId, rejectMatch[1]);
    await sendTelegramMessage(
      chatIdStr,
      result.ok ? '❌ Odrzucono.' : `Nie udało się odrzucić: ${result.error}`,
    ).catch((error) => logError('telegram', 'send-reject-result-failed', error, { chatId: chatIdStr }));
    return true;
  }

  return false;
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
  const [action, postGroupId] = data.split(':');

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

  if (action === 'publish') {
    const draftJobs = await prisma.publishJob.findMany({
      where: { postGroupId, status: 'DRAFT', video: { userId: linkedUser.id } },
      include: { socialAccount: true },
    });
    const targetPlatforms = draftJobs.map((job) => job.socialAccount.platform);

    const result = await enqueueDraftGroup(linkedUser.id, {
      postGroupId,
      publishNow: true,
      tiktokPostingConsent: targetPlatforms.includes('TIKTOK'),
      targetPlatforms,
    });

    await answerTelegramCallbackQuery(update.id).catch(() => {});

    if (!result.ok) {
      await editTelegramMessage(chatIdStr, messageId, `Nie udało się opublikować: ${result.error}`).catch((error) =>
        logError('telegram', 'edit-message-publish-error-failed', error, { chatId: chatIdStr }),
      );
      return;
    }

    await editTelegramMessage(
      chatIdStr,
      messageId,
      result.immediateOutcome === 'succeeded'
        ? 'Opublikowano ✓'
        : `Publikacja w toku/kolejce (status: ${result.immediateOutcome}). Sprawdź panel Postfly po szczegóły.`,
    ).catch((error) => logError('telegram', 'edit-message-publish-success-failed', error, { chatId: chatIdStr }));
    return;
  }

  await answerTelegramCallbackQuery(update.id).catch(() => {});
}

export async function POST(request: NextRequest) {
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
      await handleIncomingMedia(chatIdStr, linkedUser.id, { fileId: video.file_id, fileSize: video.file_size, mediaType: 'VIDEO' });
    } else if (photo && photo.length > 0) {
      const largest = photo[photo.length - 1];
      await handleIncomingMedia(chatIdStr, linkedUser.id, { fileId: largest.file_id, fileSize: largest.file_size, mediaType: 'IMAGE' });
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

  // TASK-3.2.1: /status /pause /resume /approve <id> /reject <id> - reszta komend
  // z sekcji 5 głównego planu (/retry /cancel /logs /revenue) to Etap 2, celowo poza
  // zakresem tego zadania.
  await handleTextCommand(chatIdStr, linkedUser.id, text);

  return NextResponse.json({ ok: true });
}
