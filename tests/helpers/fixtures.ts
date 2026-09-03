import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { issueAccessToken } from '@/lib/server/auth';
import type { Platform, PlanTier } from '@prisma/client';

export async function createTestUser(overrides: { email?: string; name?: string; createdAt?: Date } = {}) {
  const email = overrides.email ?? `test+${randomUUID()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      name: overrides.name ?? 'Test User',
      passwordHash: null,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  });

  const token = issueAccessToken(user.id, user.email);
  return { user, token };
}

export async function deleteTestUser(userId: string) {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

export async function createSocialAccount(
  userId: string,
  platform: Platform,
  overrides: { handle?: string; accessToken?: string | null } = {},
) {
  return prisma.socialAccount.create({
    data: {
      userId,
      platform,
      handle: overrides.handle ?? `handle-${platform.toLowerCase()}-${randomUUID().slice(0, 8)}`,
      externalId: `ext-${randomUUID()}`,
      accessToken: overrides.accessToken ?? null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
}

export async function createVideo(
  userId: string,
  overrides: { mediaType?: 'VIDEO' | 'IMAGE'; title?: string; durationSec?: number | null } = {},
) {
  return prisma.video.create({
    data: {
      userId,
      title: overrides.title ?? 'test-video',
      sourceUrl: 'https://example.com/fake.mp4',
      status: 'READY',
      mediaType: overrides.mediaType ?? 'VIDEO',
      durationSec: overrides.durationSec ?? null,
    },
  });
}

export async function createDraftJob(params: {
  videoId: string;
  socialAccountId: string;
  postGroupId: string;
  tiktokPrivacyLevel?: string | null;
}) {
  return prisma.publishJob.create({
    data: {
      status: 'DRAFT',
      postGroupId: params.postGroupId,
      caption: 'test caption',
      scheduledFor: new Date(),
      videoId: params.videoId,
      socialAccountId: params.socialAccountId,
      tiktokPrivacyLevel: params.tiktokPrivacyLevel ?? null,
    },
  });
}

export async function setUserPlan(userId: string, plan: PlanTier) {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return prisma.subscription.upsert({
    where: { userId },
    update: { plan, status: 'ACTIVE', currentPeriodStart: periodStart, currentPeriodEnd: periodEnd },
    create: {
      userId,
      plan,
      status: 'ACTIVE',
      provider: 'mock',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  });
}

export function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
