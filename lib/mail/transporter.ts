import type { Transporter } from 'nodemailer';

let cachedTransporter: Transporter | null = null;

function loadNodemailer() {
  const runtimeRequire = eval('require') as NodeRequire;
  return runtimeRequire('nodemailer') as typeof import('nodemailer');
}

function hasSmtpConfig() {
  return Boolean(
    process.env.EMAIL_SERVER_HOST &&
      process.env.EMAIL_SERVER_PORT &&
      process.env.EMAIL_SERVER_USER &&
      process.env.EMAIL_SERVER_PASSWORD,
  );
}

export function getMailTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const host = process.env.EMAIL_SERVER_HOST;
  const port = Number(process.env.EMAIL_SERVER_PORT ?? 465);
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;

  if (!host || !user || !pass || !Number.isFinite(port)) {
    throw new Error('Missing required SMTP configuration: EMAIL_SERVER_HOST/PORT/USER/PASSWORD');
  }

  const nodemailer = loadNodemailer();

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: true,
    auth: { user, pass },
  });

  return cachedTransporter;
}

declare global {
  var __postflySmtpVerifyPromise: Promise<void> | undefined;
}

export async function verifySmtpConnectionOnce() {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (globalThis.__postflySmtpVerifyPromise) {
    return globalThis.__postflySmtpVerifyPromise;
  }

  globalThis.__postflySmtpVerifyPromise = (async () => {
    if (!hasSmtpConfig()) {
      console.warn('[mail] SMTP verify skipped (missing EMAIL_SERVER_* env values).');
      return;
    }

    try {
      await getMailTransporter().verify();
      console.info('[mail] SMTP connection verified successfully.');
    } catch (error) {
      console.error('[mail] SMTP verification failed.', error);
    }
  })();

  return globalThis.__postflySmtpVerifyPromise;
}
