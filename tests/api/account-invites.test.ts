import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSendInvite = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/mail/service', () => ({ sendAccountInviteEmail: mockSendInvite }));

const { inviteAccount } = await import('@/lib/server/account-invites');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser } = await import('../helpers/fixtures');

const EMAIL = 'biuro-invite-test@example.com';
const cleanup: string[] = [];

beforeEach(() => {
  mockSendInvite.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  for (const id of cleanup.splice(0)) await deleteTestUser(id);
});

describe('inviteAccount', () => {
  it('creates a password-less account and emails a set-password link', async () => {
    const result = await inviteAccount({ email: ` ${EMAIL.toUpperCase()} `, name: 'Biuro Testowe' });
    expect(result).toMatchObject({ ok: true, status: 'created', emailSent: true, setPasswordUrl: null });

    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    expect(user?.passwordHash).toBeNull();
    expect(user?.name).toBe('Biuro Testowe');

    const [to, , link, ttl] = mockSendInvite.mock.calls[0];
    expect(to).toBe(EMAIL);
    expect(link).toContain('/reset-password?token=');
    expect(ttl).toBe(72);
    expect(await prisma.passwordResetToken.count({ where: { userId: user!.id } })).toBe(1);
  });

  it('re-invites an account that has not set a password yet', async () => {
    await inviteAccount({ email: EMAIL, name: 'Biuro Testowe' });
    const again = await inviteAccount({ email: EMAIL, name: 'Inna nazwa' });
    expect(again).toMatchObject({ ok: true, status: 'reinvited' });
    expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(1);
  });

  it('never touches an active account that already has a password', async () => {
    const { user } = await createTestUser();
    cleanup.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: 'existing-hash' } });
    const result = await inviteAccount({ email: user.email, name: 'Ktoś' });
    expect(result.ok).toBe(false);
    expect(mockSendInvite).not.toHaveBeenCalled();
  });

  it('returns the link for manual hand-over when the email fails', async () => {
    mockSendInvite.mockRejectedValueOnce(new Error('resend down'));
    const result = await inviteAccount({ email: EMAIL, name: 'Biuro Testowe' });
    expect(result).toMatchObject({ ok: true, emailSent: false });
    if (result.ok) expect(result.setPasswordUrl).toContain('/reset-password?token=');
  });

  it('rejects an invalid email', async () => {
    expect((await inviteAccount({ email: 'nie-email', name: 'X' })).ok).toBe(false);
  });
});
