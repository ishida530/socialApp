const LOCAL_DEV_SITE_URL = 'http://localhost:3000';

export function getSiteUrl(): string {
  const value =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_ORIGIN ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

  if (value) {
    return value;
  }

  // On production we fail fast, so canonical/robots/sitemap never point to localhost.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing site URL. Set NEXT_PUBLIC_SITE_URL (recommended) or NEXT_PUBLIC_SITE_ORIGIN.');
  }

  return LOCAL_DEV_SITE_URL;
}
