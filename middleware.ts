import { NextRequest, NextResponse } from 'next/server';

type SessionPayload = {
  email?: string;
  role?: string;
  roles?: string[];
  exp?: number;
};

const TOKEN_COOKIE_NAME = 'flowstate_token';

function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const fromHeader = authHeader.slice('Bearer '.length).trim();
    if (fromHeader) {
      return fromHeader;
    }
  }

  const fromCookie = request.cookies.get(TOKEN_COOKIE_NAME)?.value;
  return fromCookie?.trim() || null;
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function textToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }

  return diff === 0;
}

async function verifyHs256Jwt(token: string, secret: string): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  let header: { alg?: string; typ?: string };
  let payload: SessionPayload;

  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerPart))) as {
      alg?: string;
      typ?: string;
    };
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart))) as SessionPayload;
  } catch {
    return null;
  }

  if (header.alg !== 'HS256') {
    return null;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(textToBytes(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const data = toArrayBuffer(textToBytes(`${headerPart}.${payloadPart}`));
  const expectedSignatureBuffer = await crypto.subtle.sign('HMAC', key, data);
  const expectedSignature = new Uint8Array(expectedSignatureBuffer);
  const receivedSignature = base64UrlToBytes(signaturePart);

  if (!safeEqual(expectedSignature, receivedSignature)) {
    return null;
  }

  if (typeof payload.exp === 'number') {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowInSeconds) {
      return null;
    }
  }

  return payload;
}

function parseAdminEmails(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }

  const emails = raw
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return new Set(emails);
}

function isAdminRole(payload: SessionPayload): boolean {
  if (payload.role === 'ADMIN') {
    return true;
  }

  if (Array.isArray(payload.roles)) {
    return payload.roles.includes('ADMIN');
  }

  return false;
}

function unauthorizedResponse(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith('/api/admin')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.redirect(new URL('/', request.url));
}

export async function middleware(request: NextRequest) {
  const token = getTokenFromRequest(request);
  const secret = process.env.JWT_SECRET;
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);

  if (!token || !secret) {
    return unauthorizedResponse(request);
  }

  const session = await verifyHs256Jwt(token, secret);
  if (!session) {
    return unauthorizedResponse(request);
  }

  const sessionEmail = session.email?.trim().toLowerCase();
  const emailIsAdmin = !!sessionEmail && adminEmails.has(sessionEmail);

  if (!emailIsAdmin && !isAdminRole(session)) {
    return unauthorizedResponse(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
