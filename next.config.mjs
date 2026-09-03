/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com"
  : "script-src 'self' 'unsafe-inline' https://js.stripe.com";

const noindexPaths = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/callback',
  '/dashboard',
  '/analytics',
  '/billing',
  '/campaigns',
  '/media-library',
  '/schedule',
  '/social-accounts/:path*',
  '/admin/:path*',
];

const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    const commonHeaders = [
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()'
      },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "img-src 'self' data: blob: https:",
          "media-src 'self' blob: https:",
          scriptSrc,
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          "connect-src 'self' https://api.stripe.com https://*.supabase.co https://*.supabase.com https://open.tiktokapis.com https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://www.tiktok.com https://vercel.com https://*.vercel-storage.com",
          "frame-src https://js.stripe.com https://hooks.stripe.com",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ].join('; ')
      }
    ];

    return [
      {
        source: '/:path*',
        headers: commonHeaders,
      },
      ...noindexPaths.map((source) => ({
        source,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
      })),
    ];
  },
};

export default nextConfig;
