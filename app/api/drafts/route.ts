import { NextRequest, NextResponse } from 'next/server';
import { Platform } from '@prisma/client';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';

function normalizePlatform(value: string): Platform {
  const normalized = value.trim().toUpperCase();

  if (normalized === 'YOUTUBE') {
    return Platform.YOUTUBE;
  }

  if (normalized === 'TIKTOK') {
    return Platform.TIKTOK;
  }

  if (normalized === 'INSTAGRAM') {
    return Platform.INSTAGRAM;
  }

  if (normalized === 'FACEBOOK') {
    return Platform.FACEBOOK;
  }

  throw new Error('Nieobsługiwana platforma szkicu');
}

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const drafts = await prisma.draft.findMany({
      where: { userId: user.userId },
      include: { video: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json(drafts);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json()) as {
      caption?: string;
      platform?: string;
      hashtags?: string[];
      scheduledFor?: string | null;
      videoId?: string | null;
    };

    if (!body.caption || !body.platform) {
      return badRequest('Validation failed', [
        'caption: Treść szkicu jest wymagana',
        'platform: Platforma jest wymagana',
      ]);
    }

    const platform = normalizePlatform(body.platform);

    let videoId: string | null = null;
    if (body.videoId) {
      const video = await prisma.video.findFirst({
        where: { id: body.videoId, userId: user.userId },
        select: { id: true },
      });

      if (!video) {
        return badRequest('videoId nie należy do zalogowanego użytkownika');
      }

      videoId = video.id;
    }

    const draft = await prisma.draft.create({
      data: {
        caption: body.caption,
        platform,
        hashtags: Array.isArray(body.hashtags) ? body.hashtags : [],
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
        userId: user.userId,
        videoId,
      },
    });

    return NextResponse.json(draft);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    if (error instanceof Error && error.message === 'Nieobsługiwana platforma szkicu') {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}