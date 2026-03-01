import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

export type AuthUser = {
  userId: string;
  email: string;
};

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

export function getAuthUserFromRequest(request: NextRequest): AuthUser {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const token = authorization.replace('Bearer ', '').trim();
  const decoded = jwt.verify(token, requireJwtSecret()) as {
    sub?: string;
    email?: string;
  };

  if (!decoded.sub || !decoded.email) {
    throw new Error('Unauthorized');
  }

  return {
    userId: decoded.sub,
    email: decoded.email,
  };
}
