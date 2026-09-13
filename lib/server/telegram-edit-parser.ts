// Parses a free-text Telegram reply into an edit patch for one platform's DRAFT PublishJob.
// Convention mirrors how people already write captions natively (text, then hashtags at the
// end starting with #) so there's no special syntax to learn. YouTube additionally treats the
// first line as the title IF the message has more than one line - a single-line YouTube reply
// is treated as caption-only (title left unchanged).
//
// Any field the user didn't seem to address comes back `undefined` ("don't change this"), not
// an empty value - sending just new hashtags must not wipe out the existing caption, and vice
// versa.

export type ParsedEditReply = {
  title?: string;
  caption?: string;
  hashtags?: string[];
};

const HASHTAG_PATTERN = /#[\p{L}0-9_]+/gu;

export function parseTelegramEditReply(rawText: string, isYoutube: boolean): ParsedEditReply | null {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  let title: string | undefined;
  let bodyLines = lines;

  if (isYoutube && lines.length > 1) {
    title = lines[0].slice(0, 100);
    bodyLines = lines.slice(1);
  }

  const bodyText = bodyLines.join(' ');
  const hashtagMatches = bodyText.match(HASHTAG_PATTERN);
  const hashtags = hashtagMatches && hashtagMatches.length > 0 ? hashtagMatches.map((tag) => tag.slice(1)) : undefined;

  const captionText = bodyText.replace(HASHTAG_PATTERN, '').replace(/\s+/g, ' ').trim();
  const caption = captionText.length > 0 ? captionText : undefined;

  if (title === undefined && caption === undefined && hashtags === undefined) {
    return null;
  }

  return { title, caption, hashtags };
}
