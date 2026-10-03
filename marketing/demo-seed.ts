import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PlanTier, type Platform } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { issueAccessToken } from '@/lib/server/auth';
import { encrypt } from '@/lib/server/crypto';
import { generateBundlesWithClaude } from '@/lib/server/smart-autopilot/ai-content';
import type { PlatformBundle } from '@/lib/server/smart-autopilot/types';

// Fictional demo account for the landing "Produkt w akcji" recordings (2026-10-03). LOCAL database
// only - never run against production. Every caption is written by the real caption generator
// (the same code path users get), so the clips show genuine AI output, not hand-written copy.
//
// Photo: public/landing/demo/kubek-grafit.jpg, cropped from "Working man behind a mug (Unsplash)"
// on Wikimedia Commons, CC0 (no attribution required).

export const DEMO_EMAIL = 'marta@skorupka-demo.pl';
// Relative to the real clock, so "next 7 days" / "last 30 days" views in the app line up with the data.
export const DEMO_NOW = new Date();

const DEMO_PHOTO_LOCAL = '/landing/demo/kubek-grafit.jpg';
// The AI gets the same local crop inline (base64) - localhost isn't reachable for the API.
const DEMO_PHOTO_FOR_AI = `data:image/jpeg;base64,${readFileSync(path.resolve('public/landing/demo/kubek-grafit.jpg')).toString('base64')}`;

const BUSINESS_DESCRIPTION =
  'Skorupka - Pracownia Ceramiki we Wrocławiu. Marta Zielińska ręcznie toczy i szkliwi kubki, miski i talerze, sprzedaje je online i w pracowni oraz prowadzi weekendowe warsztaty toczenia na kole.';
const COMMUNICATION_STYLE = 'Ciepło i konkretnie, na Ty, bez przesadnych zachwytów. Najwyżej 2 emoji.';

const ACCOUNTS: Array<{ platform: Platform; handle: string; followers: number; growth: number }> = [
  { platform: 'INSTAGRAM', handle: 'skorupka.ceramika', followers: 4870, growth: 186 },
  { platform: 'FACEBOOK', handle: 'Skorupka – Pracownia Ceramiki', followers: 2140, growth: 38 },
  { platform: 'LINKEDIN', handle: 'Marta Zielińska', followers: 612, growth: 27 },
];

type SeedPost = {
  note: string;
  platforms: Platform[];
  status: 'SUCCESS' | 'PENDING';
  // Days relative to DEMO_NOW (negative = past), plus the hour.
  day: number;
  hour: number;
  views?: number;
};

const POSTS: SeedPost[] = [
  { note: 'proces szkliwienia od kuchni, timelapse', platforms: ['INSTAGRAM'], status: 'SUCCESS', day: -27, hour: 18, views: 3200 },
  { note: 'kulisy: wypał w piecu 1240°C', platforms: ['INSTAGRAM', 'FACEBOOK'], status: 'SUCCESS', day: -22, hour: 19, views: 1400 },
  { note: 'zamówienie firmowe – 40 kubków z logo dla biura', platforms: ['LINKEDIN', 'FACEBOOK'], status: 'SUCCESS', day: -17, hour: 12, views: 900 },
  { note: 'jak dbać o ceramikę ręcznie robioną, 3 zasady: bez zmywarki przy złoceniach, bez szoku termicznego, miękka gąbka', platforms: ['INSTAGRAM', 'FACEBOOK'], status: 'SUCCESS', day: -11, hour: 18, views: 1100 },
  { note: 'zdjęcia z sobotnich warsztatów dla par', platforms: ['INSTAGRAM', 'FACEBOOK'], status: 'SUCCESS', day: -5, hour: 10, views: 780 },
  { note: 'wolne miejsca na warsztaty toczenia 18.10', platforms: ['INSTAGRAM'], status: 'PENDING', day: 1, hour: 18 },
  { note: 'zamówienia firmowe na święta – kubki z logo, terminy do 15.11', platforms: ['FACEBOOK', 'LINKEDIN'], status: 'PENDING', day: 2, hour: 12 },
  { note: 'przerwa w wysyłkach 1–3.11', platforms: ['INSTAGRAM', 'FACEBOOK'], status: 'PENDING', day: 4, hour: 10 },
  { note: 'nowe szkliwo w testach – jesienne brązy', platforms: ['INSTAGRAM'], status: 'PENDING', day: 5, hour: 9 },
];

// Clip 1: the draft the recording resumes.
const DRAFT_NOTE = 'nowe kubki z serii Grafit, ciemne lśniące szkliwo, 350 ml, 20 sztuk, sprzedaż od piątku 10:00';
const DRAFT_PRODUCT = 'Kubek Grafit 350 ml';

const ANALYSIS = {
  persona: 'neutral' as const,
  contentType: 'image' as const,
  intent: 'unknown' as const,
  confidence: 1,
  safetyFlags: [],
  unknownAspectRatio: true,
  aspectRatioConfidence: 0.3,
};

async function captionsFor(note: string, platforms: Platform[], imageUrl?: string) {
  const bundles = await generateBundlesWithClaude(
    ANALYSIS,
    {
      rawInput: note,
      timezone: 'Europe/Warsaw',
      mode: 'manual',
      publishMode: 'draft',
      idempotencyKey: `demo-${randomUUID()}`,
      ...(imageUrl ? { imageUrls: [imageUrl] } : {}),
    },
    platforms as PlatformBundle['platform'][],
    BUSINESS_DESCRIPTION,
    COMMUNICATION_STYLE,
  );
  if (!bundles) {
    throw new Error(`AI did not return captions for "${note}" - check ANTHROPIC_API_KEY / credits.`);
  }
  return new Map(bundles.map((bundle) => [bundle.platform as Platform, bundle]));
}

function at(day: number, hour: number) {
  const date = new Date(DEMO_NOW);
  date.setDate(date.getDate() + day);
  date.setHours(hour, 0, 0, 0);
  return date;
}

// Uneven daily follower series ending at `followers`: `growth` gained over the last 30 days (40 days
// of history, so the monthly comparison has a baseline), with one visible bump around day -26
// (the timelapse reel).
function growthSeries(followers: number, growth: number) {
  const days = 40;
  const values: number[] = [];
  let total = 0;
  const weights = Array.from({ length: days }, (_, i) => {
    const bump = i >= 13 && i <= 16 ? 3.2 : i < 10 ? 0.3 : 1;
    const wobble = 0.6 + ((i * 37) % 11) / 10;
    return bump * wobble;
  });
  // Scale so the last 30 days add up to `growth` (the 10 older days add a little on top).
  const weightSum = weights.slice(10).reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < days; i += 1) {
    total += (weights[i] / weightSum) * growth;
    values.push(Math.round(followers - growth + total));
  }
  values[days - 1] = followers;
  return values;
}

export async function seedDemoAccount() {
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Demo seed runs against a local database only.');
  }

  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: 'Marta Zielińska',
      passwordHash: null,
      emailVerifiedAt: new Date(),
      createdAt: at(-60, 9),
      businessDescription: BUSINESS_DESCRIPTION,
      communicationStyle: COMMUNICATION_STYLE,
      defaultExplicitContent: false,
    },
  });

  await prisma.subscription.create({
    data: {
      userId: user.id,
      plan: PlanTier.BUSINESS,
      status: 'ACTIVE',
      provider: 'mock',
      currentPeriodStart: at(-5, 0),
      currentPeriodEnd: at(25, 0),
    },
  });

  await prisma.goal.create({ data: { userId: user.id, description: 'Publikować 4 razy w tygodniu na Instagramie' } });

  const accountByPlatform = new Map<Platform, string>();
  for (const account of ACCOUNTS) {
    const created = await prisma.socialAccount.create({
      data: {
        userId: user.id,
        platform: account.platform,
        handle: account.handle,
        externalId: `demo-${account.platform.toLowerCase()}`,
        accessToken: encrypt('demo-token-not-real'),
        expiresAt: at(55, 0),
      },
    });
    accountByPlatform.set(account.platform, created.id);

    const series = growthSeries(account.followers, account.growth);
    await prisma.accountGrowthSnapshot.createMany({
      data: series.map((followerCount, index) => ({
        socialAccountId: created.id,
        followerCount,
        fetchedAt: at(index - 39, 6),
        createdAt: at(index - 39, 6),
      })),
    });
  }

  // Published and scheduled posts - captions from the real generator (in parallel: ~10 AI calls).
  const allCaptions = await Promise.all(POSTS.map((post) => captionsFor(post.note, post.platforms)));
  for (const [index, post] of POSTS.entries()) {
    const captions = allCaptions[index];
    const video = await prisma.video.create({
      data: {
        userId: user.id,
        title: post.note,
        sourceUrl: DEMO_PHOTO_LOCAL,
        status: 'READY',
        mediaType: 'IMAGE',
        createdAt: at(post.day - 1, 20),
      },
    });
    const postGroupId = randomUUID();

    for (const platform of post.platforms) {
      const bundle = captions.get(platform)!;
      const when = at(post.day, post.hour);
      const job = await prisma.publishJob.create({
        data: {
          status: post.status,
          postGroupId,
          caption: bundle.caption,
          hashtags: bundle.hashtags,
          title: bundle.title ?? null,
          sourceNote: post.note,
          aiCaption: bundle.caption,
          scheduledFor: when,
          publishedAt: post.status === 'SUCCESS' ? when : null,
          remotePostId: post.status === 'SUCCESS' ? `demo-${randomUUID()}` : null,
          videoId: video.id,
          socialAccountId: accountByPlatform.get(platform)!,
          createdAt: at(post.day - 1, 21),
        },
      });

      if (post.status === 'SUCCESS' && post.views) {
        const views = Math.round(post.views * (platform === 'INSTAGRAM' ? 1 : platform === 'FACEBOOK' ? 0.55 : 0.35));
        await prisma.postMetric.create({
          data: {
            publishJobId: job.id,
            views,
            likes: Math.round(views * 0.08),
            comments: Math.round(views * 0.012),
            shares: Math.round(views * 0.006),
          },
        });
      }
    }
  }

  // The draft clip 1 resumes: photo + note, AI captions for all three platforms.
  const draftCaptions = await captionsFor(DRAFT_NOTE, ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN'], DEMO_PHOTO_FOR_AI);
  const draftVideo = await prisma.video.create({
    data: { userId: user.id, title: DRAFT_PRODUCT, sourceUrl: DEMO_PHOTO_LOCAL, status: 'READY', mediaType: 'IMAGE' },
  });
  const draftGroup = randomUUID();
  for (const platform of ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN'] as Platform[]) {
    const bundle = draftCaptions.get(platform)!;
    await prisma.publishJob.create({
      data: {
        status: 'DRAFT',
        postGroupId: draftGroup,
        caption: bundle.caption,
        hashtags: bundle.hashtags,
        title: bundle.title ?? null,
        sourceNote: DRAFT_NOTE,
        aiCaption: bundle.caption,
        scheduledFor: at(4, 10),
        videoId: draftVideo.id,
        socialAccountId: accountByPlatform.get(platform)!,
        metaPostFormat: null,
      },
    });
  }

  return { user, token: issueAccessToken(user.id, user.email), draftCaptions };
}
