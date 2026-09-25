// External content intake (2026-09-23): the bridge for a customer's own website/CRM (first user:
// the Pryzmat Nieruchomości real-estate site) to turn "a blog post went live" / "a new offer
// appeared" into a DRAFT post on THAT customer's account (resolved from its integration key, see
// app/api/external/content-intake), without a human ever re-typing the announcement by hand.
// Deliberately mirrors the shape of createDraftGroupForVideo (lib/server/publish-jobs.ts) and
// generateFacebookTextPostSuggestion (lib/server/content-suggestions.ts) rather than reusing
// generatePlatformBundles/orchestrateContent - that pipeline is built around the user's own
// free-text description of THEIR OWN video and carries autopilot/scheduling/safety-flag baggage
// that doesn't apply to a structured "here is a published article/listing" payload from another
// system. Nothing here ever publishes on its own - it only ever creates DRAFT PublishJobs, same
// "sam wymysla, ale za moja zgoda" guarantee as content-suggestions.ts.
import { randomBytes, randomUUID } from 'crypto';
import { put } from '@vercel/blob';
import { MediaType, Platform, Prisma, VideoStatus } from '@prisma/client';
import { prisma } from './prisma';
import { callClaudeTool, CLAUDE_MODELS } from './anthropic-client';
import { buildAnnouncementSystemPrompt, getPlatformMechanics, type PlatformMechanics } from './external-content-style';
import { readPlatformStyleGuides } from './platform-style-guides';
import { sendTelegramMessageWithButtons } from './telegram';
import { logError, logEvent } from './observability';

export type ExternalContentKind = 'BLOG_POST' | 'LISTING';

export type ExternalContentPayload = {
  type: ExternalContentKind;
  // The caller's own stable id for the source item (e.g. "blog:zarzadzanie-najmem-olsztyn",
  // "asari-12345") - persisted on Video.sourceRef and the sole idempotency guard: a retried
  // webhook or a listing re-synced by a cron sweep must never create a second post.
  sourceRef: string;
  title: string;
  excerpt: string;
  url: string;
  imageUrl: string;
  price?: number;
  location?: string;
  category?: string;
  // Brand settings owned by the CALLER, not by Postfly (each in-house site has its own voice):
  // brandContext - who the business is (services, region, tone), threaded into every prompt;
  // platformGuides - the business's own style guide per platform (FACEBOOK/INSTAGRAM/LINKEDIN);
  // brandHashtag - always kept in the hashtag set, even when trimming to the platform limit;
  // siteLabel - short site name for "link in bio" platforms where a URL is not clickable.
  brandContext?: string;
  platformGuides?: Partial<Record<Platform, string>>;
  brandHashtag?: string;
  siteLabel?: string;
};

export type IngestResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; postGroupId: string; jobCount: number }
  // retryable: a temporary condition (e.g. AI outage) - the caller should try again later.
  | { ok: false; error: string; retryable?: boolean };

// LinkedIn is scoped to a personal profile in this integration (see the Platform enum comment in
// schema.prisma) - fine for expert/blog content shared by the agency's own representative, odd
// for a rolling feed of individual listing ads on someone's personal profile. Listings therefore
// stay off LinkedIn entirely; TikTok is out for both (requires video, this flow only ever
// produces a static image).
const BLOG_PLATFORMS: Platform[] = [Platform.FACEBOOK, Platform.INSTAGRAM, Platform.LINKEDIN];
const LISTING_PLATFORMS: Platform[] = [Platform.FACEBOOK, Platform.INSTAGRAM];

function targetPlatformsFor(kind: ExternalContentKind): Platform[] {
  return kind === 'BLOG_POST' ? BLOG_PLATFORMS : LISTING_PLATFORMS;
}

function isSourceRefConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray((error.meta as { target?: unknown })?.target) &&
    ((error.meta as { target: string[] }).target).includes('sourceRef')
  );
}

async function reuploadImage(sourceUrl: string): Promise<{ blobUrl: string }> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download source image (${response.status}): ${sourceUrl}`);
  }

  let contentType = response.headers.get('content-type') || 'image/jpeg';
  let bytes: Buffer = Buffer.from(await response.arrayBuffer());

  // Instagram's content publishing API officially accepts JPEG only - a PNG (e.g. the blog's
  // Next.js opengraph-image) can be rejected at publish time, long after the draft looked fine.
  // Normalize here so every platform gets a JPEG. sharp ships as a dependency of Next.js itself.
  if (!contentType.includes('jpeg') && !contentType.includes('jpg')) {
    const { default: sharp } = await import('sharp');
    bytes = await sharp(bytes).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
    contentType = 'image/jpeg';
  }

  const blob = await put(`external-content/${randomBytes(8).toString('hex')}.jpg`, bytes, {
    access: 'public',
    contentType,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return { blobUrl: blob.url };
}

type AnnouncementToolResult = { caption?: string; hashtags?: string[] };

const digitsOnly = (value: string) => value.replace(/\D/g, '');

// Every number in a generated caption must come from the source data - a hallucinated floor,
// area or tax rate in a listing/announcement post is the one failure that damages the client's
// credibility the most. Allowed: numbers present in any input field, plus price per m² derived
// from price and an area found in the data (+-1 zł for rounding).
export function findUnsupportedNumbers(caption: string, payload: ExternalContentPayload): string[] {
  // brandContext is included so the business's own contact number/founding year may appear.
  const source = [payload.title, payload.excerpt, payload.location, payload.category, payload.url, payload.brandContext]
    .filter(Boolean)
    .join(' ');
  const allowed = new Set<string>();
  for (const match of source.match(/\d[\d\s ]*\d|\d/g) ?? []) {
    allowed.add(digitsOnly(match));
    for (const part of match.split(/[\s ]+/)) allowed.add(digitsOnly(part));
  }
  for (const match of source.match(/\d+/g) ?? []) allowed.add(match);
  if (payload.price !== undefined) {
    allowed.add(String(Math.round(payload.price)));
    const areaMatch = source.match(/(\d+(?:[.,]\d+)?)\s*m(?:2|²|\s*kw)/i);
    const area = areaMatch ? Number(areaMatch[1].replace(',', '.')) : NaN;
    if (area > 0) {
      const perM2 = Math.round(payload.price / area);
      [perM2 - 1, perM2, perM2 + 1].forEach((n) => allowed.add(String(n)));
    }
  }

  const unsupported: string[] = [];
  for (const match of caption.match(/\d[\d\s ]*\d|\d/g) ?? []) {
    const whole = digitsOnly(match);
    const parts = match.split(/[\s ]+/).map(digitsOnly);
    // "489 000" must match as a whole; "62 3" (two numbers split by a space) as separate parts.
    if (allowed.has(whole) || parts.every((p) => allowed.has(p))) continue;
    unsupported.push(match.trim());
  }
  return unsupported;
}

// Per-platform UTM tags, so the customer's analytics shows which network actually brings visits.
// Existing utm_* params on the caller's URL are left alone.
export function withUtm(url: string, platform: Platform, kind: ExternalContentKind): string {
  try {
    const parsed = new URL(url);
    if ([...parsed.searchParams.keys()].some((key) => key.startsWith('utm_'))) return url;
    parsed.searchParams.set('utm_source', platform.toLowerCase());
    parsed.searchParams.set('utm_medium', 'social');
    parsed.searchParams.set('utm_campaign', kind === 'BLOG_POST' ? 'artykul' : 'oferta');
    return parsed.toString();
  } catch {
    return url;
  }
}

// Platform rules enforced in code regardless of what the model wrote.
function applyPlatformRules(
  caption: string,
  hashtags: string[],
  mechanics: PlatformMechanics | null,
  payload: ExternalContentPayload,
  trackedUrl: string,
): { caption: string; hashtags: string[] } {
  const normalizeTag = (tag: string) => `#${tag.trim().replace(/^#+/, '')}`;
  const tags = Array.from(new Set(hashtags.filter((t) => t.replace(/#/g, '').trim()).map(normalizeTag)));

  // The caller's brand tag survives trimming to the platform limit.
  const brandTag = payload.brandHashtag ? normalizeTag(payload.brandHashtag) : null;
  const rest = brandTag ? tags.filter((t) => t.toLowerCase() !== brandTag.toLowerCase()) : tags;
  const maxTags = mechanics?.maxHashtags ?? 5;
  const finalTags = brandTag
    ? [...rest.slice(0, Math.max(0, maxTags - 1)), brandTag]
    : rest.slice(0, maxTags);

  let text = caption.trim();
  if (mechanics?.urlMode === 'none') {
    text = text.split(payload.url).join(payload.siteLabel ?? '').trim();
  } else if (text.includes(payload.url)) {
    text = text.split(payload.url).join(trackedUrl);
  } else {
    text = `${text}\n\n${trackedUrl}`;
  }
  return { caption: text, hashtags: finalTags };
}

// null = no post for this platform. When AI is unavailable (or keeps inventing numbers):
// - offers get NO automatic post - a bare "title · price" post looks like spam and stays in the
//   profile's history; the intake reports a retryable error and the caller retries later;
// - articles get a plain title + description post, only where the link is clickable (FB/LinkedIn),
//   never on Instagram where it would have no call to action.
export async function generateAnnouncementCaption(
  kind: ExternalContentKind,
  platform: Platform,
  payload: ExternalContentPayload,
): Promise<{ caption: string; hashtags: string[] } | null> {
  const mechanics = getPlatformMechanics(platform);
  const trackedUrl = withUtm(payload.url, platform, kind);
  const system = buildAnnouncementSystemPrompt(kind, platform, payload);
  const data = {
    platform,
    title: payload.title,
    excerpt: payload.excerpt,
    url: payload.url,
    price: payload.price,
    location: payload.location,
    category: payload.category,
  };

  let feedback = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callClaudeTool<AnnouncementToolResult>({
      scope: kind === 'BLOG_POST' ? 'blog-announcement' : 'listing-announcement',
      model: CLAUDE_MODELS.contentGeneration,
      system,
      userContent: `${JSON.stringify(data)}${feedback}`,
      tool: {
        name: 'write_announcement_post',
        description: 'Write a ready-to-publish social post announcing this content, with matching hashtags.',
        input_schema: {
          type: 'object',
          properties: {
            caption: { type: 'string' },
            hashtags: { type: 'array', items: { type: 'string' } },
          },
          required: ['caption', 'hashtags'],
        },
      },
      maxTokens: 1500,
      timeoutMs: 30000,
    });

    if (!result?.caption?.trim()) break;

    const unsupported = findUnsupportedNumbers(result.caption, payload);
    if (unsupported.length === 0) {
      return applyPlatformRules(result.caption, result.hashtags ?? [], mechanics, payload, trackedUrl);
    }
    logEvent('external-content', 'caption-unsupported-numbers', { platform, unsupported: unsupported.join(', ') });
    feedback = `\n\nPoprzednia wersja zawierała liczby, których NIE MA w danych: ${unsupported.join(', ')}. Napisz post od nowa bez nich.`;
  }

  if (kind === 'LISTING' || mechanics?.urlMode === 'none') {
    return null;
  }
  const fallback = [payload.title, payload.excerpt].filter(Boolean).join('\n\n');
  return applyPlatformRules(fallback, [], mechanics, payload, trackedUrl);
}

async function sendIntakePreview(
  telegramChatId: string | null,
  kind: ExternalContentKind,
  payload: ExternalContentPayload,
  postGroupId: string,
  jobs: Array<{ socialAccount: { platform: Platform }; caption: string }>,
) {
  if (!telegramChatId) {
    // Not lost - it stays as a DRAFT and the web Composer sheet already resumes the latest DRAFT
    // group for this account (GET /api/publish-jobs/drafts) - just no push notification about it.
    logEvent('external-content', 'no-telegram-chat-linked', { postGroupId });
    return;
  }

  const kindLabel = kind === 'BLOG_POST' ? '📝 Nowy artykuł na blogu' : '🏠 Nowa oferta';
  const lines = [
    `${kindLabel}: ${payload.title}`,
    payload.url,
    '',
    ...jobs.map((job) => `— ${job.socialAccount.platform}:\n${job.caption}`),
    '',
    'Zatwierdź, żeby opublikować na wybranych platformach, albo anuluj.',
  ];

  try {
    await sendTelegramMessageWithButtons(telegramChatId, lines.join('\n'), [
      [{ text: '✅ Publikuj', callback_data: `publish:${postGroupId}` }],
      [{ text: '❌ Anuluj', callback_data: `cancel:${postGroupId}` }],
    ]);
  } catch (error) {
    // The draft already exists and is reachable from the web composer either way - a failed
    // Telegram push is a lesser problem than losing the draft itself, so this never throws.
    logError('external-content', 'telegram-preview-failed', error, { postGroupId });
  }
}

// The receiving account's own settings win over whatever the calling site sent: the payload's
// brand fields are only defaults for an account that hasn't configured itself yet.
export function mergeBrandSettings(
  payload: ExternalContentPayload,
  account: {
    businessDescription: string | null;
    communicationStyle: string | null;
    platformStyleGuides: Prisma.JsonValue | null;
    brandHashtag: string | null;
  },
): ExternalContentPayload {
  const accountContext = [
    account.businessDescription?.trim(),
    account.communicationStyle?.trim() ? `Styl wypowiedzi: ${account.communicationStyle.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    ...payload,
    brandContext: accountContext || payload.brandContext,
    platformGuides: { ...payload.platformGuides, ...readPlatformStyleGuides(account.platformStyleGuides) },
    brandHashtag: account.brandHashtag ?? payload.brandHashtag,
  };
}

export async function ingestExternalContent(userId: string, input: ExternalContentPayload): Promise<IngestResult> {
  const alreadyIngested = await prisma.video.findUnique({
    where: { userId_sourceRef: { userId, sourceRef: input.sourceRef } },
  });
  if (alreadyIngested) {
    return { ok: true, skipped: true, reason: `sourceRef already ingested as video ${alreadyIngested.id}` };
  }

  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      telegramChatId: true,
      businessDescription: true,
      communicationStyle: true,
      platformStyleGuides: true,
      brandHashtag: true,
    },
  });
  if (!owner) {
    return { ok: false, error: 'Konto docelowe nie istnieje.' };
  }
  const payload = mergeBrandSettings(input, owner);

  const socialAccounts = await prisma.socialAccount.findMany({ where: { userId: owner.id } });
  const accountByPlatform = new Map(socialAccounts.map((account) => [account.platform, account]));
  const platforms = targetPlatformsFor(payload.type).filter((platform) => accountByPlatform.has(platform));

  if (platforms.length === 0) {
    return {
      ok: false,
      error: 'Żadne podłączone konto social nie pasuje do platform docelowych dla tego typu treści.',
    };
  }

  // Captions first: if none can be written (AI unavailable / keeps inventing numbers) nothing is
  // stored, so the caller's retry later starts clean instead of hitting "already ingested".
  const captions = (
    await Promise.all(
      platforms.map(async (platform) => ({
        platform,
        post: await generateAnnouncementCaption(payload.type, platform, payload),
      })),
    )
  ).filter((entry): entry is { platform: Platform; post: { caption: string; hashtags: string[] } } => entry.post !== null);

  if (captions.length === 0) {
    return { ok: false, retryable: true, error: 'Nie udało się teraz przygotować treści posta (AI niedostępne) — spróbuj ponownie później.' };
  }

  let blobUrl: string;
  try {
    ({ blobUrl } = await reuploadImage(payload.imageUrl));
  } catch (error) {
    logError('external-content', 'image-reupload-failed', error, { sourceRef: payload.sourceRef });
    return { ok: false, error: 'Nie udało się pobrać/przenieść obrazka źródłowego.' };
  }

  let video;
  try {
    video = await prisma.video.create({
      data: {
        title: payload.title,
        sourceUrl: blobUrl,
        status: VideoStatus.READY,
        mediaType: MediaType.IMAGE,
        sourceKind: payload.type,
        sourceRef: payload.sourceRef,
        user: { connect: { id: owner.id } },
      },
    });
  } catch (error) {
    // Two concurrent calls for the same sourceRef (e.g. a retried webhook) can both pass the
    // findUnique check above before either commits - the DB unique constraint is the real guard,
    // this just turns the resulting P2002 into the same "already ingested" outcome as the check.
    if (isSourceRefConflict(error)) {
      return { ok: true, skipped: true, reason: 'sourceRef already ingested (concurrent request)' };
    }
    throw error;
  }

  const postGroupId = randomUUID();

  const jobs = await Promise.all(
    captions.map(({ platform, post: { caption, hashtags } }) => {
      const account = accountByPlatform.get(platform)!;

      return prisma.publishJob.create({
        data: {
          status: 'DRAFT',
          postGroupId,
          caption,
          hashtags,
          title: payload.title,
          scheduledFor: new Date(),
          video: { connect: { id: video.id } },
          socialAccount: { connect: { id: account.id } },
        },
        include: { socialAccount: true },
      });
    }),
  );

  await sendIntakePreview(owner.telegramChatId, payload.type, payload, postGroupId, jobs);

  logEvent('external-content', 'ingested', {
    sourceRef: payload.sourceRef,
    type: payload.type,
    postGroupId,
    platformCount: jobs.length,
  });

  return { ok: true, skipped: false, postGroupId, jobCount: jobs.length };
}
