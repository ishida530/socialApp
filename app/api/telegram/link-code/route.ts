import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { createTelegramLinkCode } from '@/lib/server/telegram';
import { prisma } from '@/lib/server/prisma';
import { unauthorized } from '@/lib/server/http';

export async function GET(request: NextRequest) {
  let authUser;
  try {
    authUser = getAuthUserFromRequest(request);
  } catch {
    return unauthorized();
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.userId },
    select: { telegramChatId: true },
  });

  return NextResponse.json({ linked: !!user?.telegramChatId });
}

export async function POST(request: NextRequest) {
  let authUser;
  try {
    authUser = getAuthUserFromRequest(request);
  } catch {
    return unauthorized();
  }

  const { code, expiresAt } = await createTelegramLinkCode(authUser.userId);

  return NextResponse.json({
    code,
    expiresAt: expiresAt.toISOString(),
    botUsername: process.env.TELEGRAM_BOT_USERNAME ?? null,
  });
}
