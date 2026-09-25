// Admin-created accounts (2026-09-25): an operator onboards a customer (e.g. a real-estate agency)
// without opening public registration. The account is created WITHOUT a password and the customer
// sets it through an emailed link (PasswordResetToken, longer TTL than a normal reset) - the admin
// never knows the customer's password. Works in APP_MODE=personal too: the registration lock is
// about anonymous sign-ups, not about the operator adding a customer.
import { createHash, randomBytes } from 'crypto';
import { prisma } from './prisma';
import { sendAccountInviteEmail } from '@/lib/mail/service';

export const INVITE_TTL_HOURS = 72;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteResult =
  | { ok: true; status: 'created' | 'reinvited'; userId: string; emailSent: boolean; setPasswordUrl: string | null }
  | { ok: false; error: string };

function resolveFrontendUrl() {
  return process.env.FRONTEND_URL ?? 'http://localhost:3000';
}

export async function inviteAccount(input: { email: string; name: string }): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!EMAIL_PATTERN.test(email)) return { ok: false, error: 'Nieprawidłowy adres e-mail.' };
  if (!name || name.length > 100) return { ok: false, error: 'Nazwa jest wymagana (do 100 znaków).' };

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, passwordHash: true },
  });
  // An account that already has a password is a real, active user - never touch it from here.
  if (existing?.passwordHash) {
    return { ok: false, error: 'Konto z tym adresem już istnieje i ma ustawione hasło.' };
  }

  const user = existing ?? (await prisma.user.create({ data: { email, name, passwordHash: null } }));

  const token = randomBytes(32).toString('hex');
  // Unused tokens simply expire; a re-invite adds a fresh one.
  await prisma.passwordResetToken.create({
    data: {
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000),
      userId: user.id,
    },
  });

  const setPasswordUrl = new URL('/reset-password', resolveFrontendUrl());
  setPasswordUrl.searchParams.set('token', token);

  let emailSent = true;
  try {
    await sendAccountInviteEmail(email, existing?.name ?? name, setPasswordUrl.toString(), INVITE_TTL_HOURS);
  } catch (error) {
    emailSent = false;
    console.error('[mail] Account invite email sending failed.', error);
  }

  return {
    ok: true,
    status: existing ? 'reinvited' : 'created',
    userId: user.id,
    emailSent,
    // Only surfaced when the email failed, so the operator can hand the link over another way.
    setPasswordUrl: emailSent ? null : setPasswordUrl.toString(),
  };
}
