const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_REGEX = /\+?[0-9][0-9\-\s()]{6,}[0-9]/;

const PROFANITY_PATTERNS = [
  /kurw/i,
  /chuj/i,
  /jeb/i,
  /pierdol/i,
  /\bfuck/i,
  /\bshit\b/i,
];

const OLDER_AUDIENCE_PLATFORMS = new Set(['YOUTUBE', 'FACEBOOK']);

export function collectContentWarnings(
  caption: string,
  platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK',
) {
  const warnings: string[] = [];

  if (!caption.trim()) {
    return warnings;
  }

  const hasProfanity = PROFANITY_PATTERNS.some((pattern) => pattern.test(caption));
  if (hasProfanity && OLDER_AUDIENCE_PLATFORMS.has(platform)) {
    warnings.push(
      'Wulgarny język może nie pasować do tej platformy — YouTube i Facebook mają szerszą, starszą publiczność.',
    );
  }

  if (EMAIL_REGEX.test(caption) || PHONE_REGEX.test(caption)) {
    warnings.push('Wykryto dane kontaktowe (e-mail/telefon) w treści — sprawdź, czy to zamierzone.');
  }

  return warnings;
}
