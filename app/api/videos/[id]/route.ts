import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';

const MAX_TAGS_PER_VIDEO = 8;
const MAX_TAG_LENGTH = 32;

function normalizeTag(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return '';
  }

  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return withHash.replace(/[^#a-z0-9_ąćęłńóśźż]/gi, '');
}

function sanitizeTags(input: unknown) {
  if (!Array.isArray(input)) {
    return null;
  }

  const normalized = input
    .map((item) => (typeof item === 'string' ? normalizeTag(item) : ''))
    .filter((tag) => tag.length >= 2 && tag.length <= MAX_TAG_LENGTH);

  const unique = Array.from(new Set(normalized)).slice(0, MAX_TAGS_PER_VIDEO);
  return unique;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = getAuthUserFromRequest(request);
    const params = await context.params;
    const body = (await request.json()) as { tags?: unknown };

    const tags = sanitizeTags(body.tags);
    if (tags === null) {
      return badRequest('Validation failed', ['tags: tags musi byc tablica stringow']);
    }

    const video = await prisma.video.findFirst({
      where: {
        id: params.id,
        userId: user.userId,
      },
      select: { id: true },
    });

    if (!video) {
      return badRequest('Nie znaleziono wideo dla zalogowanego użytkownika');
    }

    const updated = await prisma.video.update({
      where: { id: video.id },
      data: { tags },
      select: {
        id: true,
        tags: true,
      },
    });

    return NextResponse.json({ success: true, video: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = getAuthUserFromRequest(request);
    const params = await context.params;

    const video = await prisma.video.findFirst({
      where: {
        id: params.id,
        userId: user.userId,
      },
      select: { id: true },
    });

    if (!video) {
      return badRequest('Nie znaleziono wideo dla zalogowanego użytkownika');
    }

    await prisma.video.delete({ where: { id: video.id } });

    return NextResponse.json({ success: true, id: video.id });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}