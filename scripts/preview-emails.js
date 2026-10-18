// Renders every email template with sample data into HTML files you can open in a browser. Nothing is sent.
//   npm run email:preview [-- output-folder]      (default: data/email-previews)
// Photos load from BASE_URL, so set BASE_URL=https://staycamp.online to see them with the live images.
import '../env.js';
import fs from 'node:fs';
import path from 'node:path';

const { initSchema, refreshSettings } = await import('../db.js');
const mail = await import('../mailer.js');
await initSchema();
await refreshSettings();

const out = path.resolve(process.argv[2] || 'data/email-previews');
fs.mkdirSync(out, { recursive: true });
const sent = [];
mail.collectInto(sent);

const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const booking = (over = {}) => ({
  code: 'SC-7KQ2MX', kind: 'rv', item_id: 1, start_date: day(14), end_date: day(19), nights: 5, guests: 4,
  customer_name: 'Maria Gonzalez', customer_email: 'maria@example.com', customer_phone: '(555) 010-2233',
  total: 1689.45, amount_paid: 0, deposit: 1500, status: 'pending', payment_status: 'unpaid', notes: 'Arriving around 2 PM with two kids.', ...over
});
const rv = booking(), site = booking({ kind: 'lot', item_id: 3, deposit: 0, total: 412.3, guests: 2 });
const chat = { name: 'Maria Gonzalez', email: 'maria@example.com', topic: 'RV rental' };

await mail.bookingReceived(rv, 'Coral Breeze', { paymentLink: true });
await mail.bookingConfirmed({ ...rv, status: 'confirmed' }, 'Coral Breeze');
await mail.bookingConfirmed({ ...site, status: 'confirmed' }, 'RV Site A-03 · STAYCAMPRV Resort');
await mail.paymentReceived({ ...rv, status: 'confirmed', payment_status: 'paid', amount_paid: 1689.45 }, 'Coral Breeze');
await mail.bookingCancelled({ ...rv, status: 'cancelled' }, 'Coral Breeze', { byGuest: true });
await mail.reviewRequest({ ...rv, status: 'completed' }, 'Coral Breeze');
await mail.inquiryAck({ name: 'Maria Gonzalez', email: 'maria@example.com', kind: 'tour', listingTitle: 'Deeded Lakefront RV Lot W-12' });
await mail.contactAck({ name: 'Maria Gonzalez', email: 'maria@example.com', subject: 'Group booking', message: 'Do you offer discounts for 5+ sites booked together for a rally?' });
await mail.chatOfflineAck(chat, 'Is the Coral Breeze pet friendly?');
await mail.chatReply(chat, ['Hi Maria! Yes, pets are welcome in the Coral Breeze.', 'Just add the pet-friendly option at checkout.']);
await mail.staffNewBooking(rv, 'Coral Breeze');
await mail.testEmail('maria@example.com');

const links = sent.map((m, i) => {
  const file = `${String(i + 1).padStart(2, '0')}-${m.kind}.html`;
  fs.writeFileSync(path.join(out, file), m.html);
  return `<li><a href="${file}">${m.subject}</a></li>`;
});
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Email previews</title><body style="font:16px system-ui;padding:2rem"><h1>Email previews</h1><ul>${links.join('')}</ul></body>`);
console.log(`Wrote ${sent.length} emails to ${out}\\index.html`);
