import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';
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
