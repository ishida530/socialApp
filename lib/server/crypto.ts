import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'crypto';

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, savedHash] = storedHash.split(':');
  if (!salt || !savedHash) {
    return false;
  }

  const derivedHash = scryptSync(password, salt, 64);
  const savedHashBuffer = Buffer.from(savedHash, 'hex');

  if (derivedHash.length !== savedHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedHash, savedHashBuffer);
}

function requireEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('Missing required config: ENCRYPTION_KEY');
  }

  return createHash('sha256').update(secret).digest();
}

export function encrypt(plainText: string) {
  const iv = randomBytes(12);
  const key = requireEncryptionKey();
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decrypt(payload: string) {
  const [ivPart, tagPart, encryptedPart] = payload.split('.');
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error('Invalid encrypted payload format');
  }

  const iv = Buffer.from(ivPart, 'base64url');
  const tag = Buffer.from(tagPart, 'base64url');
  const encrypted = Buffer.from(encryptedPart, 'base64url');

  const key = requireEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
