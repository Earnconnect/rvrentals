// Transactional email via Resend (https://resend.com). Configure RESEND_API_KEY and MAIL_FROM in .env.
// Sending never breaks a request: failures are logged to the email_log table and the console.
import { db, getSettings } from './db.js';

const API_KEY = process.env.RESEND_API_KEY || '';
const FROM_ADDRESS = process.env.MAIL_FROM || 'bookings@staycamp.online';
const BASE_URL = (process.env.BASE_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/$/, '');
export const mailEnabled = () => Boolean(API_KEY);
export const mailFrom = () => FROM_ADDRESS;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = s => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
// The old seeded placeholder address isn't a real inbox; never send staff alerts or replies to it.
const OLD_PLACEHOLDER = ['hello', 'riseflorals.com'].join('@');
const realBusinessEmail = s => isEmail(s.email) && s.email !== OLD_PLACEHOLDER ? s.email : '';
export const replyAddress = () => realBusinessEmail(getSettings());
// Reserved example/test domains never receive mail; sending to them only causes bounces.
const RESERVED = /@(?:[^@]*\.)?(?:example\.(?:com|org|net)|localhost)$|\.(?:test|invalid|example|localhost)$/i;
export const staffAddress = () => { const s = getSettings(); return isEmail(s.notify_email) ? s.notify_email : realBusinessEmail(s); };

// ---------- sending ----------
export async function sendMail({ to, subject, html, text, kind = 'general', replyTo }) {
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

// ---------- layout ----------
// Brand wordmark: STAYCAMP in white, RV in sunset orange (falls back to the plain name for other brands).
const wordmark = name => {
  const short = String(name || 'STAYCAMPRV LLC').replace(/,?\s+(LLC|Inc\.?|Co\.?)$/i, '');
  const m = short.match(/^(.*?)(RV)$/);
  return m ? `${esc(m[1])}<span style="color:#F7A55B">RV</span>` : esc(short);
};
function layout({ preheader = '', title, intro = '', body = '', cta, footerNote = '' }) {
  const s = getSettings();
  const btn = cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px"><tr><td style="border-radius:10px;background:#E4572E">
    <a href="${esc(cta.url)}" style="display:inline-block;padding:13px 24px;font-weight:700;font-size:15px;color:#ffffff;text-decoration:none;border-radius:10px">${esc(cta.label)}</a></td></tr></table>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F3F0EA;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#13201E">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F0EA;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E5DFD4">
  <tr><td style="background:#0E3B36;padding:22px 28px">
    <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:3px">${wordmark(s.business_name)}</div>
    <div style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#B9CDC7;font-weight:700;margin-top:5px">RV Rentals · Campgrounds · Sales</div>
  </td></tr>
  <tr><td style="padding:30px 28px 10px">
    <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;color:#13201E;font-weight:600">${esc(title)}</h1>
    ${intro ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3d4b49">${intro}</p>` : ''}
    ${body}${btn}
  </td></tr>
  <tr><td style="padding:22px 28px 28px">
    ${footerNote ? `<p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#5C6866">${footerNote}</p>` : ''}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#5C6866">Questions? Reply to this email or call <a href="tel:${esc(s.phone)}" style="color:#17695D">${esc(s.phone)}</a>.</p>
  </td></tr>
  <tr><td style="background:#F7F4EE;padding:18px 28px;font-size:12px;line-height:1.6;color:#7a8583;border-top:1px solid #EFEAE1">
    ${esc(s.business_name)} · ${esc(s.address)}<br>${esc(s.hours)}<br>
    <a href="${BASE_URL}/legal/privacy" style="color:#7a8583">Privacy Policy</a> · <a href="${BASE_URL}/legal/terms" style="color:#7a8583">Terms</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}
const rows = list => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5DFD4;border-radius:12px;border-collapse:separate;margin:8px 0 4px">
  ${list.filter(r => r && r[1] !== undefined && r[1] !== '').map(([k, v, strong], i) => `<tr><td style="padding:11px 14px;font-size:14px;color:#5C6866;${i ? 'border-top:1px solid #EFEAE1;' : ''}width:42%">${esc(k)}</td>
  <td style="padding:11px 14px;font-size:14px;color:#13201E;font-weight:${strong ? 800 : 600};${i ? 'border-top:1px solid #EFEAE1;' : ''}text-align:right">${esc(v)}</td></tr>`).join('')}</table>`;
const p = html => `<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#3d4b49">${html}</p>`;
const box = html => `<div style="margin:18px 0 0;background:#E4F0EC;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6;color:#0E3B36">${html}</div>`;
const quote = text => `<div style="margin:14px 0 0;border-left:3px solid #E5DFD4;padding:4px 0 4px 14px;font-size:14px;line-height:1.6;color:#3d4b49;white-space:pre-wrap">${esc(text)}</div>`;
const plain = lines => lines.filter(Boolean).join('\n');

// ---------- booking emails (guest) ----------
const manageUrl = b => `${BASE_URL}/booking/${encodeURIComponent(b.code)}?email=${encodeURIComponent(b.customer_email)}`;
function bookingRows(b, itemName) {
  const isRv = b.kind === 'rv', s = getSettings();
  return rows([
    ['Confirmation code', b.code, true],
    [isRv ? 'RV' : 'RV site', itemName],
    [isRv ? 'Pickup' : 'Check-in', `${fmtDate(b.start_date)} · ${isRv ? s.rv_pickup_time : s.check_in_time}`],
    [isRv ? 'Return' : 'Check-out', `${fmtDate(b.end_date)} · ${isRv ? s.rv_return_time : s.check_out_time}`],
    ['Nights · guests', `${b.nights} night${b.nights > 1 ? 's' : ''} · ${b.guests} guest${b.guests > 1 ? 's' : ''}`],
    ['Total', money(b.total), true],
    ['Paid', money(b.amount_paid)],
    b.deposit ? ['Refundable deposit (at pickup)', money(b.deposit)] : null
  ]);
}
function arrivalInfo(b) {
  const s = getSettings();
  return b.kind === 'rv'
    ? `Pickup is at <strong>${esc(s.rv_pickup_time)}</strong> at ${esc(s.address)}. Please bring your driver’s license, proof of insurance and the security deposit. We’ll walk you through the RV before you go.`
    : `Check-in begins at <strong>${esc(s.check_in_time)}</strong>. Stop at the office when you arrive at ${esc(s.address)} and we’ll guide you to your site.`;
}

export function bookingReceived(b, itemName, { paymentLink = false } = {}) {
  const first = b.customer_name.split(' ')[0];
  const confirmed = b.status === 'confirmed';
  const title = confirmed ? `You’re booked, ${first}!` : `We’ve received your booking, ${first}`;
  const intro = confirmed ? `Your ${b.kind === 'rv' ? 'RV rental' : 'RV site'} is confirmed. Here are your trip details.`
    : paymentLink ? 'Your dates are being held. Complete your payment to confirm the booking, or pay at check-in and our team will confirm it shortly.'
    : 'Your dates are held while our team reviews your request. We’ll confirm by email within a few business hours.';
  return sendMail({
    kind: 'booking_received', to: b.customer_email,
    subject: `${confirmed ? 'Booking confirmed' : 'Booking received'} · ${b.code}`,
    html: layout({ preheader: `${itemName} · ${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`, title, intro,
      body: bookingRows(b, itemName) + (confirmed ? box(arrivalInfo(b)) : ''),
      cta: { label: paymentLink && !confirmed ? 'View booking & pay' : 'View or manage your booking', url: manageUrl(b) },
      footerNote: `Cancellation policy: ${esc(getSettings().cancellation_policy)}` }),
    text: plain([title, '', intro, '', `Confirmation code: ${b.code}`, `${itemName}`, `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`, `Total: ${money(b.total)}`, '', `Manage your booking: ${manageUrl(b)}`])
  });
}
export function bookingConfirmed(b, itemName) {
  const first = b.customer_name.split(' ')[0];
  return sendMail({
    kind: 'booking_confirmed', to: b.customer_email, subject: `Booking confirmed · ${b.code}`,
    html: layout({ preheader: `See you on ${fmtDate(b.start_date)}!`, title: `You’re confirmed, ${first}!`,
      intro: `Great news — your ${b.kind === 'rv' ? 'RV rental' : 'RV site'} is confirmed.`,
      body: bookingRows(b, itemName) + box(arrivalInfo(b)), cta: { label: 'View your booking', url: manageUrl(b) } }),
    text: plain([`You're confirmed, ${first}!`, '', `${b.code} · ${itemName}`, `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`, '', `View your booking: ${manageUrl(b)}`])
  });
}
export function paymentReceived(b, itemName) {
  return sendMail({
    kind: 'payment_received', to: b.customer_email, subject: `Payment received · ${b.code}`,
    html: layout({ preheader: `We received ${money(b.amount_paid)}. Thank you!`, title: 'Payment received — thank you!',
      intro: `We’ve received your payment of <strong>${money(b.amount_paid)}</strong> for booking ${esc(b.code)}.`,
      body: bookingRows(b, itemName), cta: { label: 'View your booking', url: manageUrl(b) } }),
    text: plain(['Payment received — thank you!', `Amount: ${money(b.amount_paid)}`, `Booking: ${b.code}`, manageUrl(b)])
  });
}
export function bookingCancelled(b, itemName, { byGuest = false } = {}) {
  const s = getSettings();
  return sendMail({
    kind: 'booking_cancelled', to: b.customer_email, subject: `Booking cancelled · ${b.code}`,
    html: layout({ preheader: `${itemName} · ${fmtDate(b.start_date)}`, title: 'Your booking has been cancelled',
      intro: byGuest ? `As requested, we’ve cancelled booking <strong>${esc(b.code)}</strong>.` : `Booking <strong>${esc(b.code)}</strong> has been cancelled.`,
      body: rows([['Confirmation code', b.code, true], [b.kind === 'rv' ? 'RV' : 'RV site', itemName], ['Dates', `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`], ['Amount paid', money(b.amount_paid)]])
        + p(`Any refund due under our cancellation policy is processed to your original payment method within 5–7 business days.`)
        + box(`<strong>Cancellation policy:</strong> ${esc(s.cancellation_policy)}`),
      cta: { label: 'Book new dates', url: `${BASE_URL}/${b.kind === 'rv' ? 'rentals' : 'sites'}` } }),
    text: plain(['Your booking has been cancelled', `Code: ${b.code}`, `${itemName} · ${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`, `Refunds follow our cancellation policy: ${s.cancellation_policy}`])
  });
}

// ---------- acknowledgements (guest) ----------
export function inquiryAck({ name, email, kind, listingTitle }) {
  const label = { info: 'question', offer: 'offer', tour: 'tour request', financing: 'financing request' }[kind] || 'inquiry';
  return sendMail({
    kind: 'inquiry_ack', to: email, subject: `We received your ${label} · ${listingTitle}`,
    html: layout({ title: `Thanks, ${name.split(' ')[0]}!`, intro: `We received your ${esc(label)} about <strong>${esc(listingTitle)}</strong>. Our sales team will reach out within one business day.`,
      cta: { label: 'Browse more listings', url: `${BASE_URL}/sales` } }),
    text: `Thanks, ${name}! We received your ${label} about ${listingTitle}. Our sales team will reach out within one business day.`
  });
}
export function contactAck({ name, email, subject, message }) {
  return sendMail({
    kind: 'contact_ack', to: email, subject: 'We got your message',
    html: layout({ title: `Thanks for reaching out, ${name.split(' ')[0]}`, intro: 'Your message is in. We reply within one business day.',
      body: (subject ? rows([['Subject', subject]]) : '') + quote(message) }),
    text: `Thanks for reaching out, ${name}. Your message is in and we reply within one business day.\n\n${message}`
  });
}
export function chatOfflineAck(chat, message) {
  return sendMail({
    kind: 'chat_ack', to: chat.email, subject: 'We got your message — we’ll be in touch',
    html: layout({ title: `Thanks, ${chat.name.split(' ')[0]}!`, intro: `Our team was away when you messaged us. We’ll reply as soon as we’re back${chat.callback ? ` and call you at ${esc(chat.phone)}` : ''}.`,
      body: quote(message) + p('You can reply to this email or continue the conversation in the chat on our website.'), cta: { label: 'Visit our website', url: BASE_URL } }),
    text: `Thanks, ${chat.name}! Our team was away when you messaged us. We'll reply as soon as we're back.\n\nYour message: ${message}`
  });
}
export function chatReply(chat, replies) {
  return sendMail({
    kind: 'chat_reply', to: chat.email, subject: 'New reply from our team',
    html: layout({ preheader: replies.at(-1), title: `${chat.name.split(' ')[0]}, we replied to your chat`,
      intro: 'Here’s what our team said:', body: replies.map(quote).join(''),
      cta: { label: 'Continue the chat', url: BASE_URL }, footerNote: 'You can also simply reply to this email.' }),
    text: `We replied to your chat:\n\n${replies.join('\n\n')}\n\nContinue the chat: ${BASE_URL}`
  });
}

// ---------- staff notifications ----------
function staff(kind, subject, title, list, extra = '', path = '') {
  const to = staffAddress();
  if (!to) return Promise.resolve({ ok: false });
  return sendMail({
    kind, to, subject,
    html: layout({ title, body: rows(list) + extra, cta: { label: 'Open the back office', url: `${BASE_URL}/admin${path}` } }),
    text: plain([title, '', ...list.filter(Boolean).map(([k, v]) => `${k}: ${v}`), '', `${BASE_URL}/admin${path}`])
  });
}
export const staffNewBooking = (b, itemName) => staff('staff_booking', `New booking ${b.code} · ${itemName} · ${fmtDate(b.start_date)}`, 'New booking',
  [['Code', b.code, true], ['Guest', `${b.customer_name} · ${b.customer_email} · ${b.customer_phone || ''}`], ['Unit', itemName], ['Dates', `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)} (${b.nights} nights)`], ['Total', money(b.total), true], ['Status', b.status]],
  b.notes ? quote(b.notes) : '', '#bookings');
export const staffCancelled = (b, itemName) => staff('staff_cancel', `Guest cancelled ${b.code} · ${itemName}`, 'A guest cancelled online',
  [['Code', b.code, true], ['Guest', `${b.customer_name} · ${b.customer_email}`], ['Unit', itemName], ['Dates', `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`], ['Amount paid', money(b.amount_paid)]],
  p('Review any refund due under the cancellation policy.'), '#bookings');
export const staffInquiry = (i, listingTitle) => staff('staff_inquiry', `New ${i.kind} inquiry · ${listingTitle}`, `New sales ${i.kind === 'info' ? 'question' : i.kind}`,
  [['Listing', listingTitle], ['From', `${i.name} · ${i.email}${i.phone ? ' · ' + i.phone : ''}`], i.offer_amount ? ['Offer', money(i.offer_amount), true] : null, i.preferred_date ? ['Preferred date', fmtDate(i.preferred_date)] : null],
  i.message ? quote(i.message) : '', '#inquiries');
export const staffMessage = m => staff('staff_message', `New message · ${m.subject || m.name}`, 'New contact form message',
  [['From', `${m.name} · ${m.email}${m.phone ? ' · ' + m.phone : ''}`], ['Subject', m.subject]], quote(m.message), '#messages');
export const staffChat = (chat, message) => staff('staff_chat', `New chat from ${chat.name}${chat.callback ? ' · call back requested' : ''}`, 'New live chat while you were away',
  [['From', `${chat.name} · ${chat.email}`], chat.phone ? ['Phone', chat.phone] : null, chat.topic ? ['Topic', chat.topic] : null, chat.callback ? ['Call back', 'Requested', true] : null],
  quote(message), '#chat');

export function reviewRequest(b, itemName) {
  const first = b.customer_name.split(' ')[0];
  return sendMail({
    kind: 'review_request', to: b.customer_email, subject: `How was your stay, ${first}?`,
    html: layout({ preheader: 'Tell us about your trip in two minutes.', title: `Thanks for staying with us, ${first}!`,
      intro: `We hope you enjoyed ${b.kind === 'rv' ? 'your trip in the' : 'your stay at'} <strong>${esc(itemName)}</strong>. Would you share a few words about it? Your review helps other travelers and helps our team improve.`,
      cta: { label: 'Leave a review', url: `${manageUrl(b)}#review` } }),
    text: `Thanks for staying with us, ${first}! Leave a review: ${manageUrl(b)}#review`
  });
}
export const staffReview = t => staff('staff_review', `New ${t.rating}★ review from ${t.name} — approve to publish`, 'New guest review waiting for approval',
  [['From', `${t.name}${t.location ? ' · ' + t.location : ''} · ${t.email}`], ['Rating', '★'.repeat(t.rating) + '☆'.repeat(5 - t.rating), true], ['Stay', t.stay], ['Booking', t.booking_code]],
  quote(t.quote) + p('Open <strong>Testimonials</strong> in the back office and set it to <em>published</em> to show it on the website.'), '#testimonials');

export function testEmail(to) {
  return sendMail({ kind: 'test', to, subject: 'Test email from your booking platform',
    html: layout({ title: 'Email is working 🎉', intro: `This test was sent from <strong>${esc(FROM_ADDRESS)}</strong> through Resend. Guests will receive booking confirmations, updates and replies from this address.` }),
    text: `Email is working. Sent from ${FROM_ADDRESS}.` });
}
