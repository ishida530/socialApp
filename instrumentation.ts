export async function register() {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  const { verifySmtpConnectionOnce } = await import('./lib/mail/transporter');
  await verifySmtpConnectionOnce();
}
