const LOCAL_DEV_SITE_URL = 'http://localhost:3000';

export function getSiteUrl(): string {
  const value =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_ORIGIN ||
    process.env.FRONTEND_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

  if (value) {
    return value.replace(/\/$/, '');
  }

  // On production we fail fast, so canonical/robots/sitemap never point to localhost.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Missing site URL. Set NEXT_PUBLIC_SITE_URL (recommended), NEXT_PUBLIC_SITE_ORIGIN, or FRONTEND_URL.'
    );
  }

  return LOCAL_DEV_SITE_URL;
}
