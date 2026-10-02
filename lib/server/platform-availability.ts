import { isAdminEmail } from './admin';

// Features that depend on a pending platform review (2026-10-02, production MVP):
//   - TikTok (Content Posting API audit) and YouTube (Google OAuth verification + YouTube API
//     audit): until approved, an unaudited TikTok client can post only privately for at most 5
//     users a day, and an unverified Google app shows a warning screen and forces uploads private.
//   - Comment replies on Facebook/Instagram need pages_manage_engagement and
//     instagram_manage_comments, which production doesn't request until Meta approves them.
// Regular users see these as "wkrótce"; admins (ADMIN_EMAILS) keep full access - they record the
// review demos. After an approval, change the env var and redeploy - no code change:
//   PLATFORMS_IN_REVIEW="TIKTOK,YOUTUBE"  (default when unset; set to "" once both are approved)
//   COMMENTS_FEATURE_ENABLED="1"          (once Meta approves the two comment permissions)

const DEFAULT_PLATFORMS_IN_REVIEW = 'TIKTOK,YOUTUBE';

export function platformsInReview(): string[] {
  return (process.env.PLATFORMS_IN_REVIEW ?? DEFAULT_PLATFORMS_IN_REVIEW)
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
}

// The platforms this user can't connect yet - always empty for admins.
export function platformsInReviewFor(email: string | null | undefined): string[] {
  return isAdminEmail(email) ? [] : platformsInReview();
}

export function canConnectPlatform(platform: string, email: string | null | undefined): boolean {
  return !platformsInReviewFor(email).includes(platform.toUpperCase());
}

export function commentsFeatureEnabledFor(email: string | null | undefined): boolean {
  return process.env.COMMENTS_FEATURE_ENABLED === '1' || isAdminEmail(email);
}

export const PLATFORM_IN_REVIEW_MESSAGE =
  'Ta platforma jest jeszcze w trakcie zatwierdzania przez jej operatora - połączenie będzie dostępne wkrótce.';

export const COMMENTS_IN_REVIEW_MESSAGE =
  'Odpowiadanie na komentarze będzie dostępne wkrótce - czekamy na zatwierdzenie uprawnień przez Meta.';
