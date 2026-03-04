import { getMailTransporter } from './transporter';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function sendWelcomeEmail(userEmail: string, userName: string) {
  const from = process.env.EMAIL_FROM ?? 'PostFly <hello@postfly.app>';
  const safeName = escapeHtml(userName?.trim() || 'Twórco');

  await getMailTransporter().sendMail({
    from,
    to: userEmail,
    subject: 'Witamy w PostFly — 7 dni pełnego pakietu PRO',
    text: `Cześć ${userName || 'Twórco'}!\n\nWitamy w PostFly.\nMasz 7 dni pełnego pakietu PRO.\n\nPozdrawiamy,\nZespół PostFly`,
    html: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111827"><p>Cześć ${safeName}!</p><p>Witamy w <strong>PostFly</strong>.</p><p>Masz <strong>7 dni pełnego pakietu PRO</strong>.</p><p>Pozdrawiamy,<br/>Zespół PostFly</p></div>`,
  });
}
