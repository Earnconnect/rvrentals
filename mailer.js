// Transactional email via Resend (https://resend.com). Configure RESEND_API_KEY and MAIL_FROM in .env.
// Sending never breaks a request: failures are logged to the email_log table and the console.
// Templates use tables and inline styles because that is what email apps reliably render. Photos are the same
// ones the website shows, loaded from BASE_URL, so they only appear when BASE_URL is the public site address.
import { db, getSettings } from './db.js';
import './public/js/art.js';

const API_KEY = process.env.RESEND_API_KEY || '';
const FROM_ADDRESS = process.env.MAIL_FROM || 'bookings@staycamp.online';
const BASE_URL = (process.env.BASE_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/$/, '');
const Art = globalThis.RFArt;
export const mailEnabled = () => Boolean(API_KEY);
export const mailFrom = () => FROM_ADDRESS;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = s => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
const fmtDay = s => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) : '';
const fmtShort = s => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
// The old seeded placeholder address isn't a real inbox; never send staff alerts or replies to it.
const OLD_PLACEHOLDER = ['hello', 'riseflorals.com'].join('@');
const realBusinessEmail = s => isEmail(s.email) && s.email !== OLD_PLACEHOLDER ? s.email : '';
export const replyAddress = () => realBusinessEmail(getSettings());
// Reserved example/test domains never receive mail; sending to them only causes bounces.
const RESERVED = /@(?:[^@]*\.)?(?:example\.(?:com|org|net)|localhost)$|\.(?:test|invalid|example|localhost)$/i;
export const staffAddress = () => { const s = getSettings(); return isEmail(s.notify_email) ? s.notify_email : realBusinessEmail(s); };

// ---------- sending ----------
// For previewing designs (scripts/preview-emails.js): collect emails here instead of sending them.
let previewSink = null;
export const collectInto = list => { previewSink = list; };

export async function sendMail({ to, subject, html, text, kind = 'general', replyTo }) {
  if (previewSink) { previewSink.push({ kind, subject, html }); return { ok: true }; }
  const recipients = [].concat(to).filter(isEmail).filter(a => !RESERVED.test(a));
  if (!recipients.length) return { ok: false, error: 'No deliverable recipient' };
  const log = (status, provider_id = null, error = null) =>
    db.prepare('INSERT INTO email_log (kind, recipient, subject, status, provider_id, error) VALUES (?,?,?,?,?,?)')
      .run(kind, recipients.join(', '), subject, status, provider_id, error);
  if (!API_KEY) { await log('skipped', null, 'Email not configured (RESEND_API_KEY missing)'); return { ok: false, error: 'Email not configured' }; }
  const s = getSettings();
  const reply = replyTo || realBusinessEmail(s) || undefined;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${s.business_name || 'STAYCAMPRV LLC'} <${FROM_ADDRESS}>`, to: recipients, subject, html, text, ...(reply ? { reply_to: reply } : {}) }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Resend error ${res.status}`);
    await log('sent', data.id);
    return { ok: true, id: data.id };
  } catch (e) {
    console.error(`Email "${subject}" to ${recipients.join(', ')} failed:`, e.message);
    await log('failed', null, e.message);
    return { ok: false, error: e.message };
  }
}
// Fire-and-forget wrapper used by request handlers. settle() waits for queued emails, because a serverless
// function can be frozen as soon as its response is sent.
const pending = new Set();
export const queue = (fn, ...args) => {
  const job = Promise.resolve().then(() => fn(...args)).catch(e => console.error('Email error:', e.message));
  pending.add(job);
  job.finally(() => pending.delete(job));
};
export const settle = () => Promise.allSettled([...pending]);

// ---------- photos ----------
const absUrl = u => /^https?:/.test(u) ? u : BASE_URL + (u.startsWith('/') ? u : '/' + u);
// Card-size stock photos (760 px wide) keep emails light; uploaded photos are used as-is.
const stockPhoto = key => `${BASE_URL}/img/photos/sm/${key}.jpg`;
const TABLE = { rv: 'rvs', lot: 'lots' };
async function unitPhoto(b) {
  const item = TABLE[b.kind] && await db.prepare(`SELECT * FROM ${TABLE[b.kind]} WHERE id = ?`).get(b.item_id);
  if (!item) return { src: stockPhoto(b.kind === 'rv' ? 'class-c-camp' : 'resort-palms'), alt: '' };
  const alt = item.name || `RV site ${item.code}`;
  return { src: item.image_url ? absUrl(item.image_url) : stockPhoto(Art.keyFor(b.kind, item)), alt };
}
async function listingPhoto(title) {
  const x = await db.prepare('SELECT * FROM sales WHERE title = ?').get(title);
  if (!x) return { src: stockPhoto('class-a-road'), alt: '' };
  return { src: x.image_url ? absUrl(x.image_url) : stockPhoto(Art.keyFor('sale', x)), alt: x.title };
}

// ---------- design ----------
const C = { ink: '#13201E', text: '#3D4B49', muted: '#6B7674', line: '#E8E2D6', paper: '#F4F0E8', card: '#FFFFFF', soft: '#FAF7F1',
  palm: '#0E3B36', palm2: '#17695D', palmSoft: '#E4F0EC', sun: '#E4572E', sunSoft: '#FDEDE6', gold: '#F7A55B' };
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const TONES = { ok: [C.palmSoft, C.palm2], warn: ['#FFF4DE', '#9A6200'], bad: ['#FDE8E6', '#B3261E'], info: [C.sunSoft, C.sun] };

// Brand wordmark: STAYCAMP in white, RV in sunset orange (falls back to the plain name for other brands).
const wordmark = name => {
  const short = String(name || 'STAYCAMPRV LLC').replace(/,?\s+(LLC|Inc\.?|Co\.?)$/i, '');
  const m = short.match(/^(.*?)(RV)$/);
  return m ? `${esc(m[1])}<span style="color:${C.gold}">RV</span>` : esc(short);
};
const pill = (label, tone = 'ok') => {
  const [bg, fg] = TONES[tone];
  return `<span style="display:inline-block;background:${bg};color:${fg};font:700 11px/1 ${SANS};letter-spacing:1.2px;text-transform:uppercase;padding:7px 11px;border-radius:999px">${esc(label)}</span>`;
};
const button = (label, url) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px"><tr>
  <td style="border-radius:12px;background:${C.sun}">
    <a href="${esc(url)}" style="display:inline-block;padding:15px 28px;font:700 15px/1 ${SANS};color:#ffffff;text-decoration:none;border-radius:12px">${esc(label)}&nbsp;&nbsp;&rarr;</a>
  </td></tr></table>`;

function layout({ preheader = '', eyebrow = '', status, title, intro = '', body = '', cta, hero, footerNote = '' }) {
  const s = getSettings();
  const contact = [realBusinessEmail(s) && ['Bookings', realBusinessEmail(s)], isEmail(s.support_email) && ['Support', s.support_email]].filter(Boolean);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(title)}</title>
<style>
  @media (max-width: 620px) {
    .px { padding-left: 22px !important; padding-right: 22px !important; }
    .h1 { font-size: 25px !important; }
    .stack { display: block !important; width: 100% !important; box-sizing: border-box; }
    .stack-gap { margin-top: 12px !important; }
    .hide-sm { display: none !important; }
  }
</style></head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper}"><tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">

  <tr><td style="background:${C.palm};border-radius:18px 18px 0 0;padding:18px 28px" class="px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="width:42px;vertical-align:middle"><a href="${BASE_URL}"><img src="${BASE_URL}/img/icon-192.png" width="42" height="42" alt="" style="display:block;border:0;border-radius:11px"></a></td>
      <td style="vertical-align:middle;padding-left:12px">
        <a href="${BASE_URL}" style="text-decoration:none;font:800 21px/1 ${SANS};letter-spacing:2.5px;color:#ffffff">${wordmark(s.business_name)}</a>
        <div style="font:700 9.5px/1 ${SANS};letter-spacing:2.2px;text-transform:uppercase;color:#9FC2B9;margin-top:6px">RV Rentals · Campgrounds · Sales</div>
      </td>
    </tr></table>
  </td></tr>

  ${hero ? `<tr><td style="background:${C.palm};line-height:0;font-size:0">
    <img src="${esc(hero.src)}" width="600" alt="${esc(hero.alt || '')}" style="display:block;width:100%;max-width:600px;height:auto;border:0">
  </td></tr>` : ''}

  <tr><td style="background:${C.card};padding:34px 36px 8px;${hero ? '' : `border-top:4px solid ${C.sun};`}" class="px">
    ${eyebrow || status ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px"><tr>
      ${eyebrow ? `<td style="font:800 11px/1 ${SANS};letter-spacing:2px;text-transform:uppercase;color:${C.sun};padding-right:10px;vertical-align:middle">${esc(eyebrow)}</td>` : ''}
      ${status ? `<td style="vertical-align:middle">${pill(status.label, status.tone)}</td>` : ''}
    </tr></table>` : ''}
    <h1 class="h1" style="margin:0 0 12px;font:600 29px/1.22 ${SERIF};color:${C.ink};letter-spacing:-.2px">${esc(title)}</h1>
    ${intro ? `<p style="margin:0 0 6px;font:400 16px/1.65 ${SANS};color:${C.text}">${intro}</p>` : ''}
    ${body}
    ${cta ? button(cta.label, cta.url) : ''}
  </td></tr>

  <tr><td style="background:${C.card};padding:22px 36px 32px" class="px">
    ${footerNote ? `<p style="margin:0 0 18px;font:400 13px/1.6 ${SANS};color:${C.muted}">${footerNote}</p>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.soft};border-radius:14px"><tr><td style="padding:18px 20px">
      <div style="font:700 14px/1.4 ${SANS};color:${C.ink};margin:0 0 4px">Questions? We’re here to help.</div>
      <div style="font:400 13.5px/1.75 ${SANS};color:${C.text}">Just reply to this email${contact.length ? ', or write to us:' : '.'}
        ${contact.map(([k, v]) => `<br><span style="color:${C.muted}">${k}:</span> <a href="mailto:${esc(v)}" style="color:${C.palm2};font-weight:600;text-decoration:none">${esc(v)}</a>`).join('')}
        <br><span style="color:${C.muted}">Live chat:</span> <a href="${BASE_URL}" style="color:${C.palm2};font-weight:600;text-decoration:none">on our website</a>
      </div>
    </td></tr></table>
  </td></tr>

  <tr><td style="background:${C.palm};border-radius:0 0 18px 18px;padding:24px 28px;text-align:center" class="px">
    <div style="font:600 13px/1.6 ${SANS};color:#ffffff">${esc(s.business_name)}</div>
    <div style="font:400 12px/1.7 ${SANS};color:#9FC2B9">${esc(s.address)}<br>${esc(s.hours)}</div>
    <div style="font:600 12px/1.6 ${SANS};margin-top:12px">
      <a href="${BASE_URL}/rentals" style="color:#ffffff;text-decoration:none">RV Rentals</a><span style="color:#4E7A72">&nbsp; · &nbsp;</span>
      <a href="${BASE_URL}/sites" style="color:#ffffff;text-decoration:none">RV Sites</a><span style="color:#4E7A72">&nbsp; · &nbsp;</span>
      <a href="${BASE_URL}/manage" style="color:#ffffff;text-decoration:none">Manage booking</a>
    </div>
    <div style="font:400 11px/1.6 ${SANS};margin-top:10px">
      <a href="${BASE_URL}/legal/privacy" style="color:#9FC2B9">Privacy Policy</a><span style="color:#4E7A72"> · </span><a href="${BASE_URL}/legal/terms" style="color:#9FC2B9">Terms</a><span style="color:#4E7A72"> · </span><a href="${BASE_URL}/legal/cancellation" style="color:#9FC2B9">Cancellations</a>
    </div>
  </td></tr>

</table></td></tr></table></body></html>`;
}

// ---------- building blocks ----------
const rows = list => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px;border:1px solid ${C.line};border-radius:14px;border-collapse:separate">
  ${list.filter(r => r && r[1] !== undefined && r[1] !== '').map(([k, v, strong], i) => `<tr>
    <td style="padding:13px 16px;font:600 11px/1.4 ${SANS};letter-spacing:1px;text-transform:uppercase;color:${C.muted};${i ? `border-top:1px solid ${C.line};` : ''}width:42%;vertical-align:top">${esc(k)}</td>
    <td style="padding:13px 16px;font:${strong ? 800 : 600} ${strong ? 16 : 14}px/1.4 ${SANS};color:${C.ink};${i ? `border-top:1px solid ${C.line};` : ''}text-align:right">${esc(v)}</td></tr>`).join('')}
</table>`;
const p = html => `<p style="margin:18px 0 0;font:400 15px/1.65 ${SANS};color:${C.text}">${html}</p>`;
const box = (html, { tone = 'ok', title } = {}) => {
  const [bg, fg] = TONES[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;background:${bg};border-radius:14px"><tr><td style="padding:16px 18px;font:400 14px/1.65 ${SANS};color:${C.ink}">
    ${title ? `<div style="font:800 11px/1 ${SANS};letter-spacing:1.5px;text-transform:uppercase;color:${fg};margin:0 0 8px">${esc(title)}</div>` : ''}${html}</td></tr></table>`;
};
const quote = text => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0"><tr>
  <td style="width:4px;background:${C.gold};border-radius:4px"></td>
  <td style="padding:12px 16px;background:${C.soft};border-radius:0 12px 12px 0;font:400 14.5px/1.65 ${SANS};color:${C.text};white-space:pre-wrap">${esc(text)}</td></tr></table>`;
const plain = lines => lines.filter(Boolean).join('\n');

// The trip at a glance: two big date tiles (pickup and return, or check-in and check-out). They stack on phones.
function tripDates(b) {
  const isRv = b.kind === 'rv', s = getSettings();
  const tile = (label, date, time, extra = '') => `<td class="stack${extra}" width="48%" style="background:${C.soft};border-radius:14px;padding:16px 18px;vertical-align:top">
      <div style="font:700 10.5px/1 ${SANS};letter-spacing:1.6px;text-transform:uppercase;color:${C.muted}">${label}</div>
      <div style="font:600 21px/1.25 ${SERIF};color:${C.ink};margin-top:8px">${fmtShort(date)}</div>
      <div style="font:500 13px/1.4 ${SANS};color:${C.text};margin-top:3px">${fmtDay(date)}${time ? ` · ${esc(time)}` : ''}</div></td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0"><tr>
    ${tile(isRv ? 'Pickup' : 'Check-in', b.start_date, isRv ? s.rv_pickup_time : s.check_in_time)}
    <td class="hide-sm" width="4%" style="font-size:0;line-height:0">&nbsp;</td>
    ${tile(isRv ? 'Return' : 'Check-out', b.end_date, isRv ? s.rv_return_time : s.check_out_time, ' stack-gap')}
  </tr></table>`;
}
const balanceOf = b => b.status === 'cancelled' ? 0 : Math.max(0, Math.round((b.total - b.amount_paid) * 100) / 100);
function bookingRows(b, itemName) {
  const balance = balanceOf(b);
  return tripDates(b) + rows([
    ['Confirmation code', b.code, true],
    [b.kind === 'rv' ? 'RV' : 'RV site', itemName],
    ['Stay', `${b.nights} night${b.nights > 1 ? 's' : ''} · ${b.guests} guest${b.guests > 1 ? 's' : ''}`],
    ['Total', money(b.total), true],
    ['Paid', money(b.amount_paid)],
    balance > 0 && b.amount_paid > 0 ? ['Balance due', money(balance), true] : null,
    b.deposit ? ['Refundable deposit (at pickup)', money(b.deposit)] : null
  ]);
}
// The business's own payment instructions (Admin → Settings), shown while there is something left to pay.
const howToPay = b => {
  const text = String(getSettings().payment_instructions || '').trim();
  return text && balanceOf(b) > 0 ? box(esc(text).replace(/\n/g, '<br>'), { tone: 'info', title: 'How to pay' }) : '';
};
function arrivalInfo(b) {
  const s = getSettings();
  return b.kind === 'rv'
    ? box(`Pickup is at <strong>${esc(s.rv_pickup_time)}</strong> at ${esc(s.address)}. Please bring your driver’s license, proof of insurance and the security deposit. We’ll walk you through the RV before you head out.`, { title: 'Before you go' })
    : box(`Check-in begins at <strong>${esc(s.check_in_time)}</strong>. Stop at the office when you arrive at ${esc(s.address)} and we’ll guide you to your site.`, { title: 'When you arrive' });
}
const bookingStatus = b => b.payment_status === 'paid' ? { label: 'Paid', tone: 'ok' } : b.status === 'confirmed' ? { label: 'Confirmed', tone: 'ok' } : { label: 'Pending', tone: 'warn' };

// ---------- booking emails (guest) ----------
const manageUrl = b => `${BASE_URL}/booking/${encodeURIComponent(b.code)}?email=${encodeURIComponent(b.customer_email)}`;

export async function bookingReceived(b, itemName, { paymentLink = false } = {}) {
  const first = b.customer_name.split(' ')[0];
  const confirmed = b.status === 'confirmed';
  const title = confirmed ? `You’re booked, ${first}!` : `We’ve got your booking, ${first}`;
  const intro = confirmed ? `Your ${b.kind === 'rv' ? 'RV rental' : 'RV site'} is confirmed. Here’s everything you need for your trip.`
    : paymentLink ? 'Your dates are being held. Complete your payment to confirm the booking, or pay at check-in and our team will confirm it shortly.'
    : 'Your dates are held while our team reviews your request. We’ll confirm by email within a few business hours.';
  return sendMail({
    kind: 'booking_received', to: b.customer_email,
    subject: `${confirmed ? 'Booking confirmed' : 'Booking received'} · ${b.code}`,
    html: layout({ preheader: `${itemName} · ${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`, hero: await unitPhoto(b),
      eyebrow: confirmed ? 'Booking confirmed' : 'Booking received', status: bookingStatus(b), title, intro,
      body: bookingRows(b, itemName) + (paymentLink ? '' : howToPay(b)) + (confirmed ? arrivalInfo(b) : ''),
      cta: { label: paymentLink && !confirmed ? 'View booking & pay' : 'View or manage your booking', url: manageUrl(b) },
      footerNote: `<strong>Cancellation policy:</strong> ${esc(getSettings().cancellation_policy)}` }),
    text: plain([title, '', intro, '', `Confirmation code: ${b.code}`, `${itemName}`, `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`, `Total: ${money(b.total)}`, '', `Manage your booking: ${manageUrl(b)}`])
  });
}
export async function bookingConfirmed(b, itemName) {
  const first = b.customer_name.split(' ')[0];
  return sendMail({
    kind: 'booking_confirmed', to: b.customer_email, subject: `Booking confirmed · ${b.code}`,
    html: layout({ preheader: `See you on ${fmtDate(b.start_date)}!`, hero: await unitPhoto(b), eyebrow: 'You’re all set', status: { label: 'Confirmed', tone: 'ok' },
      title: `You’re confirmed, ${first}!`, intro: `Great news: your ${b.kind === 'rv' ? 'RV rental' : 'RV site'} is confirmed. We can’t wait to see you.`,
      body: bookingRows(b, itemName) + howToPay(b) + arrivalInfo(b), cta: { label: 'View your booking', url: manageUrl(b) } }),
    text: plain([`You're confirmed, ${first}!`, '', `${b.code} · ${itemName}`, `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`, '', `View your booking: ${manageUrl(b)}`])
  });
}
// Receipt for one payment recorded by staff (or taken online). Falls back to the booking's total paid.
export async function paymentReceived(b, itemName, { amount = b.amount_paid, method = '', paid_on = '' } = {}) {
  const full = balanceOf(b) <= 0;
  const how = [method && `by ${esc(method)}`, paid_on && `on ${fmtDate(paid_on)}`].filter(Boolean).join(' ');
  return sendMail({
    kind: 'payment_received', to: b.customer_email, subject: `${full ? 'Paid in full' : 'Payment received'} · ${b.code}`,
    html: layout({ preheader: `We received ${money(amount)}. Thank you!`, hero: await unitPhoto(b), eyebrow: 'Receipt',
      status: full ? { label: 'Paid in full', tone: 'ok' } : { label: 'Partly paid', tone: 'info' },
      title: full ? 'Paid in full. Thank you!' : 'Payment received. Thank you!',
      intro: `We’ve received your payment of <strong>${money(amount)}</strong>${how ? ' ' + how : ''} for booking ${esc(b.code)}.`
        + (full ? ' You’re all paid up. Keep this email as your receipt.' : ` Your remaining balance is <strong>${money(balanceOf(b))}</strong>.`),
      body: bookingRows(b, itemName) + (full ? '' : howToPay(b)), cta: { label: 'View your booking', url: manageUrl(b) } }),
    text: plain([full ? 'Paid in full. Thank you!' : 'Payment received. Thank you!', `Amount: ${money(amount)}${method ? ` (${method})` : ''}`, `Booking: ${b.code}`,
      full ? '' : `Balance due: ${money(balanceOf(b))}`, manageUrl(b)])
  });
}
// A website request that is still unpaid: sent a day before its dates are released.
export async function holdWarning(b, itemName, releaseOn) {
  const first = b.customer_name.split(' ')[0];
  return sendMail({
    kind: 'hold_warning', to: b.customer_email, subject: `Action needed: your dates are held until ${fmtShort(releaseOn)} · ${b.code}`,
    html: layout({ preheader: `Your ${itemName} dates are held until ${fmtDate(releaseOn)}.`, hero: await unitPhoto(b), eyebrow: 'Reminder', status: { label: 'Awaiting payment', tone: 'warn' },
      title: `${first}, your dates are held until ${fmtShort(releaseOn)}`,
      intro: `We haven’t received a payment for booking <strong>${esc(b.code)}</strong> yet. To keep your dates, please pay or reply to this email by <strong>${fmtDate(releaseOn)}</strong>. After that the dates are released so other guests can book them.`,
      body: bookingRows(b, itemName) + howToPay(b), cta: { label: 'View your booking', url: manageUrl(b) } }),
    text: plain([`Your dates are held until ${fmtDate(releaseOn)}`, `Booking ${b.code} · ${itemName}`, 'Please pay or reply to this email to keep your dates.', manageUrl(b)])
  });
}
export function holdReleased(b, itemName) {
  return sendMail({
    kind: 'hold_released', to: b.customer_email, subject: `Your hold has been released · ${b.code}`,
    html: layout({ preheader: `${itemName} · ${fmtDate(b.start_date)}`, eyebrow: 'Booking request', status: { label: 'Released', tone: 'bad' },
      title: 'Your held dates have been released',
      intro: `We didn’t receive a payment for booking <strong>${esc(b.code)}</strong>, so the dates have been released. If you still want to go, you’re welcome to book again, and if you think this is a mistake, just reply to this email.`,
      body: rows([['Confirmation code', b.code, true], [b.kind === 'rv' ? 'RV' : 'RV site', itemName], ['Dates', `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`]]),
      cta: { label: 'Book again', url: `${BASE_URL}/${b.kind === 'rv' ? 'rentals' : 'sites'}` } }),
    text: plain(['Your held dates have been released', `Booking ${b.code} · ${itemName}`, `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`, `Book again: ${BASE_URL}`])
  });
}
export function bookingCancelled(b, itemName, { byGuest = false } = {}) {
  const s = getSettings();
  return sendMail({
    kind: 'booking_cancelled', to: b.customer_email, subject: `Booking cancelled · ${b.code}`,
    html: layout({ preheader: `${itemName} · ${fmtDate(b.start_date)}`, eyebrow: 'Cancellation', status: { label: 'Cancelled', tone: 'bad' },
      title: 'Your booking has been cancelled',
      intro: byGuest ? `As requested, we’ve cancelled booking <strong>${esc(b.code)}</strong>. We’re sorry to miss you this time.` : `Booking <strong>${esc(b.code)}</strong> has been cancelled.`,
      body: rows([['Confirmation code', b.code, true], [b.kind === 'rv' ? 'RV' : 'RV site', itemName], ['Dates', `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`], ['Amount paid', money(b.amount_paid)]])
        + p('Any refund due under our cancellation policy is returned to your original payment method within 5–7 business days.')
        + box(esc(s.cancellation_policy), { tone: 'info', title: 'Cancellation policy' }),
      cta: { label: 'Find new dates', url: `${BASE_URL}/${b.kind === 'rv' ? 'rentals' : 'sites'}` } }),
    text: plain(['Your booking has been cancelled', `Code: ${b.code}`, `${itemName} · ${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`, `Refunds follow our cancellation policy: ${s.cancellation_policy}`])
  });
}

// ---------- acknowledgements (guest) ----------
export async function inquiryAck({ name, email, kind, listingTitle }) {
  const label = { info: 'question', offer: 'offer', tour: 'tour request', financing: 'financing request' }[kind] || 'inquiry';
  return sendMail({
    kind: 'inquiry_ack', to: email, subject: `We received your ${label} · ${listingTitle}`,
    html: layout({ hero: await listingPhoto(listingTitle), eyebrow: 'RV & lot sales', status: { label: 'Received', tone: 'info' },
      title: `Thanks, ${name.split(' ')[0]}!`, intro: `We received your ${esc(label)} about <strong>${esc(listingTitle)}</strong>. A member of our sales team will reach out within one business day.`,
      cta: { label: 'Browse more listings', url: `${BASE_URL}/sales` } }),
    text: `Thanks, ${name}! We received your ${label} about ${listingTitle}. Our sales team will reach out within one business day.`
  });
}
export function contactAck({ name, email, subject, message }) {
  return sendMail({
    kind: 'contact_ack', to: email, subject: 'We got your message',
    html: layout({ hero: { src: stockPhoto('palms-sky'), alt: '' }, eyebrow: 'Message received',
      title: `Thanks for reaching out, ${name.split(' ')[0]}`, intro: 'Your message is in. We reply within one business day.',
      body: (subject ? rows([['Subject', subject]]) : '') + quote(message) }),
    text: `Thanks for reaching out, ${name}. Your message is in and we reply within one business day.\n\n${message}`
  });
}
export function chatOfflineAck(chat, message) {
  return sendMail({
    kind: 'chat_ack', to: chat.email, subject: 'We got your message. We’ll be in touch.',
    html: layout({ hero: { src: stockPhoto('life-camp'), alt: '' }, eyebrow: 'Live chat',
      title: `Thanks, ${chat.name.split(' ')[0]}!`, intro: 'Our team was away when you messaged us. We’ll reply by email as soon as we’re back.',
      body: quote(message) + p('You can reply to this email or continue the conversation in the chat on our website.'), cta: { label: 'Visit our website', url: BASE_URL } }),
    text: `Thanks, ${chat.name}! Our team was away when you messaged us. We'll reply as soon as we're back.\n\nYour message: ${message}`
  });
}
export function chatReply(chat, replies) {
  return sendMail({
    kind: 'chat_reply', to: chat.email, subject: 'New reply from our team',
    html: layout({ preheader: replies.at(-1), eyebrow: 'Live chat', status: { label: 'New reply', tone: 'info' },
      title: `${chat.name.split(' ')[0]}, we replied to your chat`,
      intro: 'Here’s what our team said:', body: replies.map(quote).join(''),
      cta: { label: 'Continue the chat', url: BASE_URL }, footerNote: 'You can also simply reply to this email.' }),
    text: `We replied to your chat:\n\n${replies.join('\n\n')}\n\nContinue the chat: ${BASE_URL}`
  });
}

// ---------- staff notifications ----------
function staff(kind, subject, title, list, extra = '', path = '', tone = 'info') {
  const to = staffAddress();
  if (!to) return Promise.resolve({ ok: false });
  return sendMail({
    kind, to, subject,
    html: layout({ eyebrow: 'Back office', status: { label: 'Action needed', tone }, title, body: rows(list) + extra, cta: { label: 'Open the back office', url: `${BASE_URL}/admin${path}` } }),
    text: plain([title, '', ...list.filter(Boolean).map(([k, v]) => `${k}: ${v}`), '', `${BASE_URL}/admin${path}`])
  });
}
export const staffNewBooking = (b, itemName) => staff('staff_booking', `New booking ${b.code} · ${itemName} · ${fmtDate(b.start_date)}`, 'New booking',
  [['Code', b.code, true], ['Guest', `${b.customer_name} · ${b.customer_email}${b.customer_phone ? ' · ' + b.customer_phone : ''}`], ['Unit', itemName], ['Dates', `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)} (${b.nights} nights)`], ['Total', money(b.total), true], ['Status', b.status]],
  b.notes ? quote(b.notes) : '', '#bookings', 'ok');
export const staffCancelled = (b, itemName) => staff('staff_cancel', `Guest cancelled ${b.code} · ${itemName}`, 'A guest cancelled online',
  [['Code', b.code, true], ['Guest', `${b.customer_name} · ${b.customer_email}`], ['Unit', itemName], ['Dates', `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`], ['Amount paid', money(b.amount_paid)]],
  p('Review any refund due under the cancellation policy.'), '#bookings', 'bad');
export const staffHoldReleased = (b, itemName, days) => staff('staff_hold_released', `Released unpaid request ${b.code} · ${itemName}`, 'An unpaid request was released',
  [['Code', b.code, true], ['Guest', `${b.customer_name} · ${b.customer_email}${b.customer_phone ? ' · ' + b.customer_phone : ''}`], ['Unit', itemName], ['Dates', `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`]],
  p(`No payment was recorded within ${days} days, so the booking was cancelled and its dates are open again. The guest was emailed. To keep it, restore it in the back office and record a payment.`), '#bookings', 'warn');
export const staffInquiry = (i, listingTitle) => staff('staff_inquiry', `New ${i.kind} inquiry · ${listingTitle}`, `New sales ${i.kind === 'info' ? 'question' : i.kind}`,
  [['Listing', listingTitle], ['From', `${i.name} · ${i.email}${i.phone ? ' · ' + i.phone : ''}`], i.offer_amount ? ['Offer', money(i.offer_amount), true] : null, i.preferred_date ? ['Preferred date', fmtDate(i.preferred_date)] : null],
  i.message ? quote(i.message) : '', '#inquiries');
export const staffMessage = m => staff('staff_message', `New message · ${m.subject || m.name}`, 'New contact form message',
  [['From', `${m.name} · ${m.email}${m.phone ? ' · ' + m.phone : ''}`], ['Subject', m.subject]], quote(m.message), '#messages');
export const staffChat = (chat, message) => staff('staff_chat', `New chat from ${chat.name}`, 'New live chat while you were away',
  [['From', `${chat.name} · ${chat.email}`], chat.topic ? ['Topic', chat.topic] : null],
  quote(message), '#chat');

export async function reviewRequest(b, itemName) {
  const first = b.customer_name.split(' ')[0];
  const stars = `<div style="font:400 30px/1 ${SANS};letter-spacing:6px;color:${C.gold};margin:22px 0 0">★★★★★</div>`;
  return sendMail({
    kind: 'review_request', to: b.customer_email, subject: `How was your stay, ${first}?`,
    html: layout({ preheader: 'Tell us about your trip in two minutes.', hero: await unitPhoto(b), eyebrow: 'Your feedback',
      title: `Thanks for traveling with us, ${first}!`,
      intro: `We hope you loved ${b.kind === 'rv' ? 'your trip in the' : 'your stay at'} <strong>${esc(itemName)}</strong>. Would you share a few words about it? Your review helps other travelers, and helps our team get even better.`,
      body: stars, cta: { label: 'Leave a review', url: `${manageUrl(b)}#review` } }),
    text: `Thanks for staying with us, ${first}! Leave a review: ${manageUrl(b)}#review`
  });
}
export const staffReview = t => staff('staff_review', `New ${t.rating}★ review from ${t.name}, approve to publish`, 'New guest review waiting for approval',
  [['From', `${t.name}${t.location ? ' · ' + t.location : ''} · ${t.email}`], ['Rating', '★'.repeat(t.rating) + '☆'.repeat(5 - t.rating), true], ['Stay', t.stay], ['Booking', t.booking_code]],
  quote(t.quote) + p('Open <strong>Testimonials</strong> in the back office and set it to <em>published</em> to show it on the website.'), '#testimonials');

export function testEmail(to) {
  return sendMail({ kind: 'test', to, subject: 'Test email from your booking platform',
    html: layout({ hero: { src: stockPhoto('hero-lakeside'), alt: '' }, eyebrow: 'Test email', status: { label: 'Working', tone: 'ok' }, title: 'Email is working 🎉',
      intro: `This test was sent from <strong>${esc(FROM_ADDRESS)}</strong> through Resend. Guests will receive booking confirmations, updates and replies from this address.` }),
    text: `Email is working. Sent from ${FROM_ADDRESS}.` });
}
