import { NextRequest, NextResponse } from 'next/server';
import { issueAccessToken } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { prisma } from '@/lib/server/prisma';
import { verifyPassword } from '@/lib/server/crypto';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };

    if (!body.email || !body.password) {
      return badRequest('Validation failed', [
        'email: Email jest wymagany',
        'password: Hasło jest wymagane',
      ]);
    }

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user?.passwordHash) {
      return unauthorized('Invalid credentials');
    }

    const isValid = verifyPassword(body.password, user.passwordHash);
    if (!isValid) {
      return unauthorized('Invalid credentials');
    }

    return NextResponse.json({
      accessToken: issueAccessToken(user.id, user.email),
      tokenType: 'Bearer',
    });
  } catch (error) {
    return serverError(error);
  }
}
