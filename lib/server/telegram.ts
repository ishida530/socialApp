import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';
import { put } from '@vercel/blob';
import { MediaType, VideoStatus } from '@prisma/client';
import { prisma } from './prisma';

const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const TELEGRAM_WEBHOOK_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

function requireBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('Missing required config: TELEGRAM_BOT_TOKEN');
  }
  return token;
}

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

// Kod czytelny do ręcznego przepisania na telefonie: bez znaków łatwych do pomylenia
// (0/O, 1/I/l), same wielkie litery + cyfry.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateReadableCode(length = 8) {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export async function createTelegramLinkCode(userId: string) {
  // Jeden aktywny kod na użytkownika naraz - poprzednie nieużyte kody tracą ważność,
  // żeby nie zostawiać wielu równolegle ważnych kodów do tego samego konta.
  await prisma.telegramLinkCode.updateMany({
    where: { userId, usedAt: null },
    data: { expiresAt: new Date(0) },
  });

  const code = generateReadableCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

  await prisma.telegramLinkCode.create({
    data: {
      codeHash: hashCode(code),
      userId,
      expiresAt,
    },
  });

  return { code, expiresAt };
}

export function verifyTelegramWebhookSecret(request: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    return false;
  }

  const provided = request.headers.get(TELEGRAM_WEBHOOK_SECRET_HEADER);
  if (!provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function sendTelegramMessage(chatId: string, text: string) {
  const token = requireBotToken();

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Telegram sendMessage failed: ${errorBody || response.statusText}`);
  }
}

type LinkCodeResult =
  | { status: 'linked'; userId: string }
  | { status: 'invalid-or-expired' };

// Ponowne powiązanie tego samego chatId z innym kontem Postfly nadpisuje poprzednie
// powiązanie - to samo zachowanie co reconnect kont social w lib/server/social-oauth.ts,
// nie nowy wzorzec (decyzja Architekta, TASK-3.1.1).
export async function consumeTelegramLinkCode(code: string, chatId: string): Promise<LinkCodeResult> {
  const codeHash = hashCode(code.trim().toUpperCase());

  const linkCode = await prisma.telegramLinkCode.findUnique({
    where: { codeHash },
  });

  if (!linkCode || linkCode.usedAt || linkCode.expiresAt <= new Date()) {
    return { status: 'invalid-or-expired' };
  }

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { telegramChatId: chatId, id: { not: linkCode.userId } },
      data: { telegramChatId: null },
    }),
    prisma.user.update({
      where: { id: linkCode.userId },
      data: { telegramChatId: chatId },
    }),
    prisma.telegramLinkCode.update({
      where: { id: linkCode.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { status: 'linked', userId: linkCode.userId };
}

export async function findUserByTelegramChatId(chatId: string) {
  return prisma.user.findUnique({ where: { telegramChatId: chatId } });
}

// TASK-3.2.1: /pause i /resume. Filtr per-user w publish-processor.ts (claimDuePublishJobs),
// nie globalny wyłącznik.
export async function setPublishingPaused(userId: string, paused: boolean) {
  await prisma.user.update({ where: { id: userId }, data: { publishingPaused: paused } });
}

type InlineButton = { text: string; callback_data: string };

export async function sendTelegramMessageWithButtons(
  chatId: string,
  text: string,
  buttons: InlineButton[][],
): Promise<{ messageId: number } | null> {
  const token = requireBotToken();

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: buttons },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Telegram sendMessage (with buttons) failed: ${errorBody || response.statusText}`);
  }

  const payload = (await response.json()) as { result?: { message_id?: number } };
  return payload.result?.message_id ? { messageId: payload.result.message_id } : null;
}

export async function editTelegramMessage(
  chatId: string,
  messageId: number,
  text: string,
  buttons?: InlineButton[][],
) {
  const token = requireBotToken();

  const response = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Telegram editMessageText failed: ${errorBody || response.statusText}`);
  }
}

export async function answerTelegramCallbackQuery(callbackQueryId: string, text?: string) {
  const token = requireBotToken();

  const response = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Telegram answerCallbackQuery failed: ${errorBody || response.statusText}`);
  }
}

// Telegram Bot API nie udostępnia plików ponad 20 MB przez getFile (twardy limit platformy,
// nie coś do obejścia) - sprawdzane PRZED próbą pobrania, żeby dać czytelny komunikat
// zamiast milczącego błędu.
export const TELEGRAM_MAX_DOWNLOADABLE_FILE_BYTES = 20 * 1024 * 1024;

export async function downloadTelegramFile(fileId: string): Promise<{ bytes: Buffer; filePath: string }> {
  const token = requireBotToken();

  const getFileResponse = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!getFileResponse.ok) {
    const errorBody = await getFileResponse.text();
    throw new Error(`Telegram getFile failed: ${errorBody || getFileResponse.statusText}`);
  }

  const getFilePayload = (await getFileResponse.json()) as {
    result?: { file_path?: string; file_size?: number };
  };
  const filePath = getFilePayload.result?.file_path;
  if (!filePath) {
    throw new Error('Telegram getFile response missing file_path');
  }

  const downloadResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!downloadResponse.ok) {
    throw new Error(`Telegram file download failed: ${downloadResponse.status}`);
  }

  const bytes = Buffer.from(await downloadResponse.arrayBuffer());
  return { bytes, filePath };
}

// Serwer sam wgrywa bajty do Vercel Blob (analogicznie do scripts/backup-database.mjs,
// TASK-1.1.2) - w przeciwieństwie do app/api/videos/blob-upload/route.ts, które zakłada
// upload bezpośrednio z przeglądarki przez @vercel/blob/client i tu nie ma zastosowania,
// bo Telegram dostarcza plik przez własne API, nie przez formularz w przeglądarce.
export async function uploadTelegramMediaAsVideo(
  userId: string,
  fileId: string,
  mediaType: 'VIDEO' | 'IMAGE',
  title: string,
) {
  const { bytes, filePath } = await downloadTelegramFile(fileId);
  const extension = filePath.includes('.') ? filePath.slice(filePath.lastIndexOf('.')) : mediaType === 'IMAGE' ? '.jpg' : '.mp4';
  const contentType = mediaType === 'IMAGE' ? 'image/jpeg' : 'video/mp4';

  const blob = await put(`telegram-uploads/${randomBytes(8).toString('hex')}${extension}`, bytes, {
    access: 'public',
    contentType,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  const video = await prisma.video.create({
    data: {
      title,
      sourceUrl: blob.url,
      localPath: null,
      status: VideoStatus.READY,
      mediaType: mediaType === 'IMAGE' ? MediaType.IMAGE : MediaType.VIDEO,
      user: { connect: { id: userId } },
    },
  });

  return video;
}
