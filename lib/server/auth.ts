import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

export type AuthUser = {
  userId: string;
  email: string;
};

export const TOKEN_COOKIE_NAME = 'flowstate_token';

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Missing required config: JWT_SECRET');
  }

  return secret;
}

export function issueAccessToken(userId: string, email: string) {
  const expiresInRaw = process.env.JWT_EXPIRES_IN;
  const expiresIn = expiresInRaw ? Number(expiresInRaw) : 3600;

  return jwt.sign({ sub: userId, email }, requireJwtSecret(), {
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
  });
}

export function verifyAccessToken(token: string): AuthUser {
  let decoded: {
    sub?: string;
    email?: string;
  };

  try {
    decoded = jwt.verify(token, requireJwtSecret()) as {
      sub?: string;
      email?: string;
    };
  } catch {
    throw new Error('Unauthorized');
  }

  if (!decoded.sub || !decoded.email) {
    throw new Error('Unauthorized');
  }

  return {
    userId: decoded.sub,
    email: decoded.email,
  };
}

function getTokenFromRequest(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    const fromHeader = authorization.replace('Bearer ', '').trim();
    if (fromHeader) {
      return fromHeader;
    }
  }

  return request.cookies.get(TOKEN_COOKIE_NAME)?.value?.trim() || null;
}

export function getAuthUserFromRequest(request: NextRequest): AuthUser {
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Error('Unauthorized');
  }

  return verifyAccessToken(token);
}
