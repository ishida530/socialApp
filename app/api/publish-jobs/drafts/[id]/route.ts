import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, notFound, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { fetchTikTokCreatorInfo, TikTokCreatorCannotPostError } from '@/lib/server/tiktok-creator-info';
import { collectContentWarnings } from '@/lib/server/content-safety';
import { PUBLIC_SOCIAL_ACCOUNT_SELECT } from '@/lib/server/public-fields';
import { isMetaPostFormat, META_POST_FORMATS, metaPostFormatOptions } from '@/lib/meta-post-format';

type PatchBody = {
  caption?: string;
  hashtags?: string[];
  title?: string | null;
  mentions?: string[];
  tiktokPrivacyLevel?: string;
  tiktokAllowComment?: boolean;
  tiktokAllowDuet?: boolean;
  tiktokAllowStitch?: boolean;
  tiktokConsent?: boolean;
  tiktokDisclosureEnabled?: boolean;
  tiktokBrandOrganic?: boolean;
  tiktokBrandedContent?: boolean;
  isExplicit?: boolean;
  metaPostFormat?: string;
  youtubePrivacyStatus?: string;
};

const YOUTUBE_PRIVACY_STATUSES = ['public', 'unlisted', 'private'];

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getAuthUserFromRequest(request);

    const rateLimit = await consumeRateLimit({
      key: `publish-jobs:drafts-patch:${user.userId}`,
      // 120, not 30 (2026-09-30): every TikTok toggle, the consent checkbox and each debounced
      // caption edit is its own PATCH - a single careful pass through the composer (exactly what
      // a TikTok audit reviewer's demo does) could exhaust 30 and fail the save with a 429.
      limit: 120,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return tooManyRequests('Too many requests. Try again later.', rateLimit.retryAfterSec);
    }

    const params = await context.params;
    const body = (await request.json()) as PatchBody;

    const job = await prisma.publishJob.findFirst({
      where: {
        id: params.id,
        status: 'DRAFT',
        video: { userId: user.userId },
      },
      include: { video: true, socialAccount: { select: PUBLIC_SOCIAL_ACCOUNT_SELECT } },
    });

    if (!job) {
      return notFound('Nie znaleziono niedokończonego posta dla tej platformy.');
    }

    const data: Record<string, unknown> = {};

    if (typeof body.caption === 'string') {
      data.caption = body.caption;
    }

    if (Array.isArray(body.hashtags)) {
      data.hashtags = body.hashtags.filter((tag) => typeof tag === 'string');
    }

    if (body.title !== undefined) {
      data.title = body.title === null ? null : String(body.title);
    }

    if (Array.isArray(body.mentions)) {
      data.mentions = body.mentions.filter((mention) => typeof mention === 'string');
    }

    if (typeof body.isExplicit === 'boolean') {
      data.isExplicit = body.isExplicit;
    }

    const touchesTikTokSettings =
      body.tiktokPrivacyLevel !== undefined ||
      body.tiktokAllowComment !== undefined ||
      body.tiktokAllowDuet !== undefined ||
      body.tiktokAllowStitch !== undefined;

    if (touchesTikTokSettings) {
      if (job.socialAccount.platform !== 'TIKTOK') {
        return badRequest('Ustawienia TikToka dotyczą tylko zadania dla platformy TikTok.');
      }

      // "Creator can't post right now" (guideline 1b) must not lock the draft: the user still has
      // to be able to untick things. Publishing is blocked elsewhere (composer + enqueue +
      // processor); here only a privacy change needs the live options, so only that is refused.
      let creatorInfo: Awaited<ReturnType<typeof fetchTikTokCreatorInfo>> | null = null;
      try {
        creatorInfo = await fetchTikTokCreatorInfo(job.socialAccountId);
      } catch (error) {
        if (!(error instanceof TikTokCreatorCannotPostError) || body.tiktokPrivacyLevel !== undefined) {
          throw error;
        }
      }

      // Privacy is only validated/saved when this request sets it (2026-09-30): the interaction
      // checkboxes are saved independently, in whatever order the user ticks them - requiring the
      // privacy level on every one of those PATCHes made a checkbox ticked before picking privacy
      // fail with a 400. enqueueDraftGroup still refuses to publish without a privacy level.
      if (body.tiktokPrivacyLevel !== undefined) {
        const privacyOptions = Array.isArray(creatorInfo?.privacy_level_options)
          ? creatorInfo.privacy_level_options
          : [];

        if (!body.tiktokPrivacyLevel || !privacyOptions.includes(body.tiktokPrivacyLevel)) {
          return badRequest(`Niepoprawna prywatność TikTok. Dozwolone: ${privacyOptions.join(', ')}`);
        }

        // Mirrors the check in the Commercial Content Disclosure block below, for the reverse
        // order: brandedContent already saved as true, THIS request is the one changing privacy.
        if (body.tiktokPrivacyLevel === 'SELF_ONLY' && job.tiktokBrandedContent) {
          return badRequest('Treść sponsorowana ("Branded Content") na TikToku nie może być prywatna.');
        }

        data.tiktokPrivacyLevel = body.tiktokPrivacyLevel;
      }

      // Defaults to OFF, not on (2026-09-30, TikTok Content Posting API audit rejection, ref
      // 20260913074631): "Users must manually turn on these interaction settings and none should
      // be checked by default." A field neither present in this request nor already saved as
      // `true` on the job must resolve to `false`, never inherit an implicit "on".
      const allowComment =
        body.tiktokAllowComment !== undefined ? body.tiktokAllowComment === true : job.tiktokAllowComment === true;
      // Duet/Stitch don't exist for photo posts (guideline 2c: "for Photo Posts, only 'Allow
      // Comment' can be displayed") - never persist them as on for an image.
      const isPhotoPost = job.video.mediaType === 'IMAGE';
      const allowDuet =
        !isPhotoPost &&
        (body.tiktokAllowDuet !== undefined ? body.tiktokAllowDuet === true : job.tiktokAllowDuet === true);
      const allowStitch =
        !isPhotoPost &&
        (body.tiktokAllowStitch !== undefined ? body.tiktokAllowStitch === true : job.tiktokAllowStitch === true);

      // Explicitly turning on something the creator disabled in TikTok is refused. A value that
      // was saved as on BEFORE the creator disabled it is switched off silently instead - the UI
      // shows that checkbox greyed out and unticked, so a 400 there would be unfixable for the user.
      if (creatorInfo?.comment_disabled && body.tiktokAllowComment === true) {
        return badRequest('Na tym koncie TikTok komentarze są wyłączone. Odznacz komentarze.');
      }

      if (job.video.mediaType === 'VIDEO' && creatorInfo?.duet_disabled && body.tiktokAllowDuet === true) {
        return badRequest('Na tym koncie TikTok duet jest wyłączony. Odznacz duet.');
      }

      if (job.video.mediaType === 'VIDEO' && creatorInfo?.stitch_disabled && body.tiktokAllowStitch === true) {
        return badRequest('Na tym koncie TikTok stitch jest wyłączony. Odznacz stitch.');
      }

      if (
        job.video.mediaType === 'VIDEO' &&
        typeof creatorInfo?.max_video_post_duration_sec === 'number' &&
        job.video.durationSec &&
        job.video.durationSec > creatorInfo.max_video_post_duration_sec
      ) {
        return badRequest(
          `Film przekracza maksymalny limit TikTok (${creatorInfo.max_video_post_duration_sec}s) dla tego konta.`,
        );
      }

      data.tiktokAllowComment = allowComment && !creatorInfo?.comment_disabled;
      data.tiktokAllowDuet = allowDuet && !creatorInfo?.duet_disabled;
      data.tiktokAllowStitch = allowStitch && !creatorInfo?.stitch_disabled;
    }

    // Commercial Content Disclosure (TikTok Content Sharing Guidelines section 3, 2026-09-30
    // audit rejection ref 20260913074631). Saved independently of the privacy/interaction block
    // above - a user can toggle disclosure on before picking a privacy level. The "at least one
    // of Your Brand / Branded Content must be chosen once disclosure is on" rule is enforced at
    // enqueue time (lib/server/publish-jobs.ts's enqueueDraftGroup), not here, so a user can save
    // "disclosure on" as an intermediate state while still deciding.
    const touchesTikTokDisclosure =
      body.tiktokDisclosureEnabled !== undefined ||
      body.tiktokBrandOrganic !== undefined ||
      body.tiktokBrandedContent !== undefined;

    if (touchesTikTokDisclosure) {
      if (job.socialAccount.platform !== 'TIKTOK') {
        return badRequest('Ujawnienie treści komercyjnej dotyczy tylko zadania dla platformy TikTok.');
      }

      if (body.tiktokDisclosureEnabled !== undefined) {
        data.tiktokDisclosureEnabled = body.tiktokDisclosureEnabled;
      }
      if (body.tiktokBrandOrganic !== undefined) {
        data.tiktokBrandOrganic = body.tiktokBrandOrganic;
      }
      if (body.tiktokBrandedContent !== undefined) {
        data.tiktokBrandedContent = body.tiktokBrandedContent;
      }

      const brandedContent = body.tiktokBrandedContent ?? job.tiktokBrandedContent ?? false;
      const effectivePrivacy = data.tiktokPrivacyLevel ?? job.tiktokPrivacyLevel;

      // "Branded content visibility cannot be set to private" - guideline section 3b. Checked
      // here too (not just when the privacy dropdown itself changes) since this PATCH can be the
      // one that flips brandedContent on while SELF_ONLY was already saved from an earlier save.
      if (brandedContent && effectivePrivacy === 'SELF_ONLY') {
        return badRequest('Treść sponsorowana ("Branded Content") na TikToku nie może być prywatna.');
      }
    }

    if (body.metaPostFormat !== undefined) {
      if (job.socialAccount.platform !== 'FACEBOOK' && job.socialAccount.platform !== 'INSTAGRAM') {
        return badRequest('Format publikacji (Reels/zwykły post) dotyczy tylko Facebooka i Instagrama.');
      }

      if (job.video.mediaType !== 'VIDEO') {
        return badRequest('Format publikacji (Reels/zwykły post) dotyczy tylko materiałów wideo.');
      }

      if (!isMetaPostFormat(body.metaPostFormat)) {
        return badRequest(`Niepoprawny format publikacji. Dozwolone: ${META_POST_FORMATS.join(', ')}`);
      }

      // Allowed formats per platform come from lib/meta-post-format.ts (shared with the web
      // composer and Telegram): Facebook video - REELS/FEED/BOTH; Instagram video - REELS only
      // (Meta retired media_type=VIDEO; a Reel with share_to_feed already reaches the feed).
      const allowedFormats = metaPostFormatOptions(job.socialAccount.platform, job.video.mediaType);
      if (!allowedFormats.includes(body.metaPostFormat)) {
        return badRequest(
          job.socialAccount.platform === 'INSTAGRAM'
            ? 'Na Instagramie każdy film jest publikowany jako Reels.'
            : `Niepoprawny format publikacji. Dozwolone: ${allowedFormats.join(', ')}`,
        );
      }

      data.metaPostFormat = body.metaPostFormat;
    }

    if (body.youtubePrivacyStatus !== undefined) {
      if (job.socialAccount.platform !== 'YOUTUBE') {
        return badRequest('Widoczność YouTube dotyczy tylko zadania dla platformy YouTube.');
      }

      if (!YOUTUBE_PRIVACY_STATUSES.includes(body.youtubePrivacyStatus)) {
        return badRequest(`Niepoprawna widoczność YouTube. Dozwolone: ${YOUTUBE_PRIVACY_STATUSES.join(', ')}`);
      }

      data.youtubePrivacyStatus = body.youtubePrivacyStatus;
    }

    if (body.tiktokConsent !== undefined) {
      if (job.socialAccount.platform !== 'TIKTOK') {
        return badRequest('Zgoda TikTok dotyczy tylko zadania dla platformy TikTok.');
      }

      data.tiktokConsentAt = body.tiktokConsent ? new Date() : null;
    }

    if (typeof data.caption === 'string') {
      data.contentWarnings = collectContentWarnings(data.caption, job.socialAccount.platform);
    }

    // Consent is to THIS exact post (guideline 5c, and 4: the declaration text itself depends on
    // the Branded Content choice). Any later change to a TikTok draft - caption, hashtags, privacy,
    // interactions, disclosure - voids an earlier tick, so the user re-confirms what they now see.
    if (
      job.socialAccount.platform === 'TIKTOK' &&
      body.tiktokConsent === undefined &&
      job.tiktokConsentAt &&
      Object.keys(data).length > 0
    ) {
      data.tiktokConsentAt = null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(job);
    }

    const updated = await prisma.publishJob.update({
      where: { id: job.id },
      data,
      include: { video: true, socialAccount: { select: PUBLIC_SOCIAL_ACCOUNT_SELECT } },
    });

    // Remember this as the account's new "sticky" default - read back by createDraftGroupForVideo
    // for the NEXT draft on this account, on either channel (web or Telegram). Best-effort: a
    // failure here must not fail the save the user is actually waiting on.
    //
    // TikTok settings (privacy/allow*/disclosure) are deliberately EXCLUDED from this (2026-09-30,
    // Content Posting API audit rejection ref 20260913074631) - see the comment on
    // SocialAccount.lastTiktokPrivacyLevel in schema.prisma. metaPostFormat (Meta only) is
    // unaffected by TikTok's guidelines and keeps its sticky default.
    if (body.metaPostFormat !== undefined) {
      await prisma.socialAccount
        .update({
          where: { id: job.socialAccountId },
          data: {
            lastMetaPostFormat: data.metaPostFormat as string,
          },
        })
        .catch((error) => console.error('[publish-jobs/drafts/:id] failed to persist sticky account defaults', error));
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    if (error instanceof TikTokCreatorCannotPostError) {
      return badRequest(error.userMessage);
    }

    // Same failure mode as social-accounts/tiktok/creator-info: fetchTikTokCreatorInfo can
    // throw internal details (token decryption, TikTok API errors) that must not reach the
    // client verbatim. Log server-side, return a message the user can act on.
    console.error('[publish-jobs/drafts/:id] PATCH failed', error);
    return badRequest('Nie udało się zaktualizować posta. Spróbuj ponownie później.');
  }
}
