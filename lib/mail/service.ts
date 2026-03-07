import { Resend } from 'resend';
import type { ContactCategory } from '@/lib/contact';

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

export async function sendPasswordResetEmail(userEmail: string, resetLink: string) {
  const from = process.env.EMAIL_FROM ?? 'PostFly <hello@postfly.pl>';
  const safeResetLink = escapeHtml(resetLink);

  const result = await getResendClient().emails.send({
    from,
    to: userEmail,
    subject: 'PostFly - reset hasla',
    text:
      `Otrzymalismy prosbe o reset hasla do Twojego konta.\n\n` +
      `Kliknij w link, aby ustawic nowe haslo:\n${resetLink}\n\n` +
      'Link wygasa po 30 minutach. Jesli to nie Ty wysylales prosbe, zignoruj te wiadomosc.',
    html:
      '<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111827">' +
      '<p>Otrzymalismy prosbe o reset hasla do Twojego konta.</p>' +
      `<p><a href="${safeResetLink}" target="_blank" rel="noopener noreferrer">Kliknij tutaj, aby ustawic nowe haslo</a></p>` +
      '<p>Link wygasa po <strong>30 minutach</strong>.</p>' +
      '<p>Jesli to nie Ty wysylales prosbe, zignoruj te wiadomosc.</p>' +
      '</div>',
  });

  if (result.error) {
    throw new Error(`[mail] Resend error ${result.error.statusCode}: ${result.error.message}`);
  }
}

type ContactMessageInput = {
  name: string;
  email: string;
  category: ContactCategory;
  message: string;
  source: string;
  ip?: string;
  userAgent?: string;
};

function resolveCategoryLabel(category: ContactCategory) {
  switch (category) {
    case 'bug':
      return 'Blad techniczny';
    case 'suggestion':
      return 'Sugestia funkcji';
    case 'pricing':
      return 'Pytanie o plan lub cennik';
    case 'account':
      return 'Sprawa konta lub rozliczen';
    case 'partnership':
      return 'Wspolpraca';
    case 'general':
    default:
      return 'Pytanie ogolne';
  }
}

export async function sendContactMessageEmail(input: ContactMessageInput) {
  const from = process.env.EMAIL_FROM ?? 'PostFly <hello@postfly.pl>';
  const configuredRecipients = process.env.CONTACT_EMAIL_TO;
  const to = configuredRecipients
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!to || to.length === 0) {
    throw new Error('Missing required mail config: CONTACT_EMAIL_TO');
  }

  const recipients = to.length === 1 ? to[0] : to;
  const safeName = escapeHtml(input.name);
  const safeEmail = escapeHtml(input.email);
  const safeCategory = escapeHtml(resolveCategoryLabel(input.category));
  const safeMessage = escapeHtml(input.message).replaceAll('\n', '<br/>');
  const safeSource = escapeHtml(input.source);
  const safeIp = escapeHtml(input.ip ?? 'unknown');
  const safeUserAgent = escapeHtml(input.userAgent ?? 'unknown');

  const result = await getResendClient().emails.send({
    from,
    to: recipients,
    replyTo: input.email,
    subject: `[Kontakt] ${resolveCategoryLabel(input.category)} - ${input.name}`,
    text:
      `Nowa wiadomosc kontaktowa\n\n` +
      `Kategoria: ${resolveCategoryLabel(input.category)}\n` +
      `Nadawca: ${input.name}\n` +
      `Email: ${input.email}\n` +
      `Zrodlo: ${input.source}\n` +
      `IP: ${input.ip ?? 'unknown'}\n` +
      `User-Agent: ${input.userAgent ?? 'unknown'}\n\n` +
      `${input.message}`,
    html:
      '<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111827">' +
      '<p><strong>Nowa wiadomosc kontaktowa</strong></p>' +
      `<p><strong>Kategoria:</strong> ${safeCategory}<br/>` +
      `<strong>Nadawca:</strong> ${safeName}<br/>` +
      `<strong>Email:</strong> ${safeEmail}<br/>` +
      `<strong>Zrodlo:</strong> ${safeSource}<br/>` +
      `<strong>IP:</strong> ${safeIp}<br/>` +
      `<strong>User-Agent:</strong> ${safeUserAgent}</p>` +
      `<p>${safeMessage}</p>` +
      '</div>',
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
