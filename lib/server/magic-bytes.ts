const ISO_BASE_MEDIA_ATOMS = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'pnot']);

export type MediaSignature =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'video/iso-base-media'
  | 'video/x-matroska'
  | 'video/mpeg';

const VIDEO_SIGNATURES: MediaSignature[] = ['video/iso-base-media', 'video/x-matroska', 'video/mpeg'];

function readAscii(bytes: Uint8Array, start: number, length: number) {
  return Buffer.from(bytes.subarray(start, start + length)).toString('ascii');
}

// Sniffs a file's real format from its leading bytes (magic numbers), independent of
// the filename extension or client-declared Content-Type — both of which are
// attacker-controlled and are not sufficient validation on their own.
export function detectMediaSignature(bytes: Uint8Array): MediaSignature | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (bytes.length >= 12 && readAscii(bytes, 0, 4) === 'RIFF' && readAscii(bytes, 8, 4) === 'WEBP') {
    return 'image/webp';
  }

  if (bytes.length >= 8 && ISO_BASE_MEDIA_ATOMS.has(readAscii(bytes, 4, 4))) {
    return 'video/iso-base-media';
  }

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return 'video/x-matroska';
  }

  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] >= 0xb0) {
    return 'video/mpeg';
  }

  return null;
}

export function isImageSignature(signature: MediaSignature | null): boolean {
  return signature === 'image/jpeg' || signature === 'image/png' || signature === 'image/webp';
}

export function isVideoSignature(signature: MediaSignature | null): boolean {
  return signature !== null && VIDEO_SIGNATURES.includes(signature);
}

const EXTENSION_KIND: Record<string, 'image' | 'video'> = {
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.webp': 'image',
  '.mp4': 'video',
  '.mov': 'video',
};

// Validates that the sniffed signature matches the general media kind (image vs.
// video) implied by the extension — not an exact codec/container match, since
// containers like .mov legitimately vary at the byte level across encoders.
export function matchesExtensionKind(extension: string, signature: MediaSignature | null): boolean {
  const kind = EXTENSION_KIND[extension];
  if (!kind) {
    return false;
  }

  return kind === 'image' ? isImageSignature(signature) : isVideoSignature(signature);
}

const CONTENT_TYPE_KIND: Record<string, 'image' | 'video'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/3gpp': 'video',
  'video/3gpp2': 'video',
  'video/mpeg': 'video',
  'video/x-matroska': 'video',
};

export function matchesDeclaredContentTypeKind(contentType: string, signature: MediaSignature | null): boolean {
  const kind = CONTENT_TYPE_KIND[contentType.toLowerCase()];
  if (!kind) {
    return false;
  }

  return kind === 'image' ? isImageSignature(signature) : isVideoSignature(signature);
}
