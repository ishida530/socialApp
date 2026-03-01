import { NextRequest, NextResponse } from 'next/server';
import { issueAccessToken } from '@/lib/server/auth';
import { badRequest, serverError } from '@/lib/server/http';
import { hashPassword } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: string;
      name?: string;
      password?: string;
    };

    if (!body.email || !body.name || !body.password) {
      return badRequest('Validation failed', [
        'email: Email jest wymagany',
        'name: Nazwa jest wymagana',
        'password: Hasło jest wymagane',
      ]);
    }

    const existing = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existing) {
      return badRequest('User with this email already exists');
    }

    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash: hashPassword(body.password),
      },
    });

    return NextResponse.json({
      accessToken: issueAccessToken(user.id, user.email),
      tokenType: 'Bearer',
    });
  } catch (error) {
    return serverError(error);
  }
}
