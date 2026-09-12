import { NextRequest, NextResponse } from 'next/server';
import {
  consumeTelegramLinkCode,
  findUserByTelegramChatId,
  sendTelegramMessage,
  verifyTelegramWebhookSecret,
} from '@/lib/server/telegram';
import { unauthorized } from '@/lib/server/http';
import { logError, logEvent } from '@/lib/server/observability';

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    text?: string;
  };
};

const START_COMMAND_PATTERN = /^\/start(?:@\w+)?\s+(\S+)/i;

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

  const chatId = update.message?.chat?.id;
  const text = update.message?.text;

  if (chatId === undefined || chatId === null || !text) {
    return NextResponse.json({ ok: true });
  }

  const chatIdStr = String(chatId);

  const startMatch = text.match(START_COMMAND_PATTERN);
  if (startMatch) {
    const result = await consumeTelegramLinkCode(startMatch[1], chatIdStr);

    if (result.status === 'linked') {
      logEvent('telegram', 'account-linked', { userId: result.userId });
      await sendTelegramMessage(
        chatIdStr,
        'Konto Postfly połączone! Od teraz będziesz dostawał tu powiadomienia i mógł zatwierdzać publikacje.',
      ).catch((error) => logError('telegram', 'send-link-confirmation-failed', error, { chatId: chatIdStr }));
    } else {
      await sendTelegramMessage(
        chatIdStr,
        'Ten kod jest nieprawidłowy albo wygasł. Wygeneruj nowy kod w panelu Postfly (Ustawienia konta) i spróbuj ponownie.',
      ).catch((error) => logError('telegram', 'send-invalid-code-failed', error, { chatId: chatIdStr }));
    }

    return NextResponse.json({ ok: true });
  }

  // Każda inna wiadomość: brak powiązania = odrzucona, zero dostępu do jakichkolwiek danych
  // (sekcja 4.1 głównego planu). Routing wiadomości od powiązanych chatów do kolejki komend
  // to TASK-3.1.2/TASK-3.2.1, celowo poza zakresem tego zadania.
  const linkedUser = await findUserByTelegramChatId(chatIdStr);
  if (!linkedUser) {
    await sendTelegramMessage(
      chatIdStr,
      'To konto Telegram nie jest jeszcze połączone z żadnym kontem Postfly. Wygeneruj kod w panelu (Ustawienia konta) i wyślij /start <kod>.',
    ).catch((error) => logError('telegram', 'send-not-linked-failed', error, { chatId: chatIdStr }));
  }

  return NextResponse.json({ ok: true });
}
