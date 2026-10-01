import { Linkedin } from 'lucide-react';
import { siFacebook, siInstagram, siTiktok, siYoutube } from 'simple-icons';

// Platform logos from the official brand marks (simple-icons, CC0), never redrawn approximations
// (2026-10-01, app review): YouTube's branding guidelines allow only official YouTube logos, Meta's
// require the unmodified "f" logo, Google's the unmodified "G". Colors are the brands' own or the
// allowed single-color (black/white) variants:
//   - YouTube: red icon on a white tile, so the play triangle stays white
//   - Facebook: "f" logo in Facebook blue on a white tile (or white on Facebook-blue buttons)
//   - Instagram / TikTok: single-color glyph in the current text color
// LinkedIn isn't part of any review here and has no simple-icons mark - lucide stays.

export type BrandPlatform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN';

function BrandSvg({ path, title, fill, className }: { path: string; title: string; fill: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={title} className={className} fill={fill}>
      <path d={path} />
    </svg>
  );
}

export function PlatformBrandIcon({ platform, className = 'h-5 w-5' }: { platform: BrandPlatform; className?: string }) {
  switch (platform) {
    case 'YOUTUBE':
      return (
        <span className="inline-flex items-center justify-center rounded-md bg-white p-0.5">
          <BrandSvg path={siYoutube.path} title="YouTube" fill={`#${siYoutube.hex}`} className={className} />
        </span>
      );
    case 'FACEBOOK':
      return (
        <span className="inline-flex items-center justify-center rounded-full bg-white">
          <BrandSvg path={siFacebook.path} title="Facebook" fill={`#${siFacebook.hex}`} className={className} />
        </span>
      );
    case 'INSTAGRAM':
      return <BrandSvg path={siInstagram.path} title="Instagram" fill="currentColor" className={className} />;
    case 'TIKTOK':
      return <BrandSvg path={siTiktok.path} title="TikTok" fill="currentColor" className={className} />;
    case 'LINKEDIN':
      return <Linkedin className={`${className} text-sky-600`} aria-label="LinkedIn" />;
  }
}

// White "f" for buttons on Facebook blue (Meta's reversed logo variant).
export function FacebookLogoWhite({ className = 'h-5 w-5' }: { className?: string }) {
  return <BrandSvg path={siFacebook.path} title="Facebook" fill="#FFFFFF" className={className} />;
}

export function TikTokLogo({ className = 'h-5 w-5' }: { className?: string }) {
  return <BrandSvg path={siTiktok.path} title="TikTok" fill="currentColor" className={className} />;
}

// Google's standard multi-color "G" (as used by Google's own Sign-In button) - unmodified.
export function GoogleGLogo({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label="Google" className={className}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
