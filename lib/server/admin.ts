// Shared admin-email check (2026-09-15) - middleware.ts already gates /admin/* web routes by
// comparing a JWT's email against ADMIN_EMAILS; this is the same check for contexts that don't
// go through that middleware (the Telegram webhook), reading the same env var so there's exactly
// one place that defines "who is an admin".
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(email.trim().toLowerCase());
}
