// External content intake (2026-09-23): the bridge for other in-house sites (starting with the
// Prymat Nieruchomości real-estate site) to turn "a blog post went live" / "a new listing
// appeared" into a DRAFT post here, without a human ever re-typing the announcement by hand.
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
import { PLATFORM_ALGORITHM_KNOWLEDGE } from './platform-knowledge';
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
};

export type IngestResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; postGroupId: string; jobCount: number }
  | { ok: false; error: string };

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

// APP_MODE=personal (see README) already closes registration after the first account - every
// other cron/webhook entry point in this codebase makes the same single-owner assumption. There
// is exactly one account to resolve here, not a userId carried in the request.
async function getOwnerUser() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!user) {
    throw new Error('No Postfly account exists yet - connect at least one account before using content intake.');
  }
  return user;
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

const BLOG_ANNOUNCEMENT_SYSTEM_PROMPT = [
  'Piszesz GOTOWY do publikacji post zapowiadający nowy artykuł na blogu biura nieruchomości, po polsku - nie pomysł, gotowa treść.',
  'Dopasuj ton do platformy: Facebook/Instagram - naturalny, lokalny, bezpośredni, zero korpomowy. LinkedIn - rzeczowy, ekspercki, adresowany do inwestorów/klientów biznesowych, bez emoji-spamu.',
  'Zawsze zachęcaj do kliknięcia w link i przeczytania całości, nigdy nie streszczaj artykułu na tyle dokładnie, żeby czytelnik nie musiał już kliknąć.',
  'Zaproponuj 3-6 trafnych hashtagów po polsku (miasto, temat, marka) - nigdy generycznych ("#nieruchomosci" samo w sobie to za mało, dodaj kontekst miasta/tematu).',
  'Bazuj WYŁĄCZNIE na podanych danych (tytuł, fragment, kategoria) - nigdy nie zmyślaj cen, adresów ani faktów, których nie ma w danych.',
  PLATFORM_ALGORITHM_KNOWLEDGE,
].join(' ');

const LISTING_ANNOUNCEMENT_SYSTEM_PROMPT = [
  'Piszesz GOTOWY do publikacji post ogłaszający nową ofertę nieruchomości biura, po polsku - nie pomysł, gotowa treść.',
  'Ton naturalny i lokalny, jak polecenie od znajomego z branży, nigdy szablonowy język typu "Mamy przyjemność zaoferować Państwu...".',
  'Podaj wprost typ nieruchomości, lokalizację i cenę jeśli są w danych - to najważniejsza informacja dla kogoś przewijającego feed.',
  'Zachęć do kliknięcia w link po pełne szczegóły/zdjęcia, nigdy nie zmyślaj szczegółów (metraż, liczba pokoi, stan), których nie ma w danych.',
  'Zaproponuj 3-6 trafnych hashtagów po polsku (miasto, typ nieruchomości, marka).',
  PLATFORM_ALGORITHM_KNOWLEDGE,
].join(' ');

type AnnouncementToolResult = { caption?: string; hashtags?: string[] };

async function generateCaption(
  kind: ExternalContentKind,
  platform: Platform,
  payload: ExternalContentPayload,
): Promise<{ caption: string; hashtags: string[] }> {
  const system = kind === 'BLOG_POST' ? BLOG_ANNOUNCEMENT_SYSTEM_PROMPT : LISTING_ANNOUNCEMENT_SYSTEM_PROMPT;
  const userContent = JSON.stringify({
    platform,
    title: payload.title,
    excerpt: payload.excerpt,
    url: payload.url,
    price: payload.price,
    location: payload.location,
    category: payload.category,
  });

  const result = await callClaudeTool<AnnouncementToolResult>({
    scope: kind === 'BLOG_POST' ? 'blog-announcement' : 'listing-announcement',
    model: CLAUDE_MODELS.contentGeneration,
    system,
    userContent,
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
    maxTokens: 500,
    timeoutMs: 20000,
  });

  if (!result?.caption?.trim()) {
    // Claude unconfigured/unavailable must never silently drop a real announcement - fall back to
    // a plain, honest deterministic post instead of failing the whole intake.
    return {
      caption: [payload.title, payload.excerpt, payload.url].filter(Boolean).join('\n\n'),
      hashtags: [],
    };
  }

  return { caption: result.caption.trim(), hashtags: result.hashtags ?? [] };
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

export async function ingestExternalContent(payload: ExternalContentPayload): Promise<IngestResult> {
  const alreadyIngested = await prisma.video.findUnique({ where: { sourceRef: payload.sourceRef } });
  if (alreadyIngested) {
    return { ok: true, skipped: true, reason: `sourceRef already ingested as video ${alreadyIngested.id}` };
  }

  const owner = await getOwnerUser();

  const socialAccounts = await prisma.socialAccount.findMany({ where: { userId: owner.id } });
  const accountByPlatform = new Map(socialAccounts.map((account) => [account.platform, account]));
  const platforms = targetPlatformsFor(payload.type).filter((platform) => accountByPlatform.has(platform));

  if (platforms.length === 0) {
    return {
      ok: false,
      error: 'Żadne podłączone konto social nie pasuje do platform docelowych dla tego typu treści.',
    };
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
    platforms.map(async (platform) => {
      const account = accountByPlatform.get(platform)!;
      const { caption, hashtags } = await generateCaption(payload.type, platform, payload);

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
