import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResendClient() {
  if (resendClient) {
    return resendClient;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Missing required mail config: RESEND_API_KEY');
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function sendWelcomeEmail(userEmail: string, userName: string) {
  const from = process.env.EMAIL_FROM ?? 'PostFly <hello@postfly.pl>';
  const safeName = escapeHtml(userName?.trim() || 'Twórco');

  const result = await getResendClient().emails.send({
    from,
    to: userEmail,
    subject: 'Witamy w PostFly — 7 dni pełnego pakietu PRO',
    text: `Cześć ${userName || 'Twórco'}!\n\nWitamy w PostFly.\nMasz 7 dni pełnego pakietu PRO.\n\nPozdrawiamy,\nZespół PostFly`,
    html: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111827"><p>Cześć ${safeName}!</p><p>Witamy w <strong>PostFly</strong>.</p><p>Masz <strong>7 dni pełnego pakietu PRO</strong>.</p><p>Pozdrawiamy,<br/>Zespół PostFly</p></div>`,
  });

  if (result.error) {
    throw new Error(`[mail] Resend error ${result.error.statusCode}: ${result.error.message}`);
  }
}

declare global {
  var __postflyMailProviderChecked: boolean | undefined;
}

export async function verifyMailProviderOnce() {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (globalThis.__postflyMailProviderChecked) {
    return;
  }

  globalThis.__postflyMailProviderChecked = true;

  if (!process.env.RESEND_API_KEY) {
    console.warn('[mail] RESEND_API_KEY is missing; outgoing emails are disabled.');
    return;
  }

  console.info('[mail] Resend mail provider is configured.');
}
