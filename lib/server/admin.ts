// Shared admin-email check (2026-09-15) - middleware.ts already gates /admin/* web routes by
// comparing a JWT's email against ADMIN_EMAILS; this is the same check for contexts that don't
// go through that middleware (the Telegram webhook), reading the same env var so there's exactly
// one place that defines "who is an admin".
export function isAdminEmail(email: string | null | undefined): boolean {
  return emailListIncludes(process.env.ADMIN_EMAILS, email);
}

// Platform reviewers' test accounts (2026-10-02). TikTok, Google and Meta reviewers log in with
// the test credentials from the review request and must be able to try every feature under
// review (TikTok/YouTube connection, comment replies) - but they must NOT get the admin panel,
// so they're a separate list: REVIEWER_EMAILS="review@example.com".
export function isReviewerEmail(email: string | null | undefined): boolean {
  return emailListIncludes(process.env.REVIEWER_EMAILS, email);
}

// Admins record the review demos, reviewers test them - both see features still in review.
export function hasReviewAccess(email: string | null | undefined): boolean {
  return isAdminEmail(email) || isReviewerEmail(email);
}

function emailListIncludes(list: string | undefined, email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const entries = (list ?? '')
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return entries.includes(email.trim().toLowerCase());
}
