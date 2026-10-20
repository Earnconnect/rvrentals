// STAYCAMPRV LLC — API + web app. Exported for Vercel (api/index.js); server.js runs it as a normal server.
import './env.js';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, getSettings, refreshSettings, setSetting, DEFAULT_SETTINGS, hashPassword, verifyPassword, UPLOAD_DIR, SERVERLESS, initSchema, seedIfEmpty } from './db.js';
import './public/js/regions.js';
import * as mail from './mailer.js';
import { importListing, ImportError } from './importer.js';
import { seoFor, renderPage, seoJson, sitemapXml, robotsTxt } from './seo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = (process.env.BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : `http://localhost:${PORT}`)).replace(/\/$/, '');
process.env.BASE_URL ||= BASE_URL;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const SECURE_COOKIE = BASE_URL.startsWith('https://');
const SESSION_DAYS = 7;

await initSchema();
await seedIfEmpty();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', SERVERLESS ? true : 'loopback');
// Vercel rejects request bodies over 4.5 MB, so photos are resized in the browser before upload.
app.use(express.json({ limit: '12mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
// Keep the back office and API out of search results.
app.use((req, res, next) => { if (/^\/(admin|api)(\/|$|\.html)/.test(req.path)) res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });
app.get(['/index.html', '/index'], (req, res) => res.redirect(301, '/'));
// On Vercel, public/ is served by the CDN and never reaches this function.
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], index: false }));
// Uploaded photos are stored in the database. Older installs may still have files in data/uploads.
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.get('/uploads/:name', async (req, res) => {
  const f = await db.prepare('SELECT type, data FROM uploads WHERE name = ?').get(req.params.name);
  if (!f) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type(f.type).send(Buffer.from(f.data));
});
// Every request sees current settings, even when another server instance changed them.
app.use(async (req, res, next) => { await refreshSettings(); next(); });
// A serverless function can be frozen once it responds, so finish queued emails first.
if (SERVERLESS) {
  app.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = body => { mail.settle().then(() => json(body)); return res; };
    next();
  });
}
app.get('/robots.txt', (req, res) => res.set('Cache-Control', 'public, s-maxage=3600').type('text/plain').send(robotsTxt()));
app.get('/sitemap.xml', async (req, res) => res.set('Cache-Control', 'public, s-maxage=3600').type('application/xml').send(await sitemapXml()));

// ---------- helpers ----------
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const parseJSON = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const todayStr = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const nightsBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Public shape of a row. The link a listing was imported from is staff-only, so it's dropped here
// (the admin list adds it back).
function hydrate(row) {
  if (!row) return row;
  const { source_url, ...o } = row;
  if ('features' in o) o.features = parseJSON(o.features, []);
  if ('addons' in o) o.addons = parseJSON(o.addons, []);
  if ('amenities' in o) o.amenities = parseJSON(o.amenities, []);
  return o;
}

const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}|${req.route?.path || req.path}`;
    const now = Date.now();
    const list = (hits.get(key) || []).filter(t => now - t < windowMs);
    list.push(now);
    hits.set(key, list);
    if (list.length > max) return res.status(429).json({ error: 'Too many requests — please wait a minute and try again.' });
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < 3600000)) hits.delete(k); }, 600000).unref();

const TABLE = { rv: 'rvs', lot: 'lots' };
async function getItem(kind, id) {
  const table = TABLE[kind];
  if (!table) throw new HttpError(400, 'Invalid booking type.');
  const row = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(id));
  if (!row) throw new HttpError(404, kind === 'rv' ? 'RV not found.' : 'Site not found.');
  return hydrate(row);
}
const itemLabel = async (kind, item) => {
  if (kind === 'rv') return item.name;
  const cg = item.campground_id && await db.prepare('SELECT name FROM campgrounds WHERE id = ?').get(item.campground_id);
  return `RV Site ${item.code}${cg ? ' · ' + cg.name : ''}`;
};

// Nights an RV or site can't be booked: live bookings plus dates staff blocked (maintenance, owner use).
// Blocks get booking_id -1 so excluding a booking by id never excludes them.
const BUSY = `(SELECT kind, item_id, start_date, end_date, id AS booking_id FROM bookings WHERE status != 'cancelled'
  UNION ALL SELECT kind, item_id, start_date, end_date, -1 FROM blocks)`;
// SQL condition that is true when the unit is free for [start, end). Binds: kind, item_id, end, start, excluded booking id.
const FREE_SQL = `NOT EXISTS (SELECT 1 FROM ${BUSY} x WHERE x.kind = ? AND x.item_id = ? AND x.start_date < ? AND x.end_date > ? AND x.booking_id != ?)`;

async function isAvailable(kind, id, start, end, excludeId = 0) {
  return Boolean((await db.prepare(`SELECT ${FREE_SQL} AS free`).get(kind, Number(id), end, start, excludeId)).free);
}
async function bookedRanges(kind, id) {
  return db.prepare(`SELECT start_date AS start, end_date AS end FROM ${BUSY} x WHERE kind = ? AND item_id = ?
    AND end_date > ? ORDER BY start_date`).all(kind, Number(id), todayStr());
}
// Ids of every RV or site taken for any night in [start, end), in one query instead of one per item.
async function bookedIds(kind, start, end) {
  const rows = await db.prepare(`SELECT DISTINCT item_id FROM ${BUSY} x WHERE kind = ? AND start_date < ? AND end_date > ?`).all(kind, end, start);
  return new Set(rows.map(r => r.item_id));
}

// Greedy tiered pricing: months, then weeks, then nights — never more than a cheaper tier.
function tieredCost(n, nightly, weekly, monthly) {
  let cost = 0, r = n;
  if (monthly > 0) { cost += Math.floor(r / 30) * monthly; r %= 30; }
  let part = r * nightly;
  if (weekly > 0) part = Math.min(part, Math.floor(r / 7) * weekly + (r % 7) * nightly, Math.ceil(r / 7) * weekly);
  if (monthly > 0 && r > 0) part = Math.min(part, monthly);
  return round2(cost + part);
}

async function computeQuote(kind, item, start, end, addonIds = [], { excludeId = 0, ignoreMin = false } = {}) {
  const settings = getSettings();
  if (!isDate(start) || !isDate(end)) throw new HttpError(400, 'Please choose valid check-in and check-out dates.');
  const nights = nightsBetween(start, end);
  if (nights < 1) throw new HttpError(400, 'Check-out must be after check-in.');
  if (nights > 365) throw new HttpError(400, 'Stays are limited to 365 nights. Contact us for annual leases.');
  if (!ignoreMin && start < todayStr()) throw new HttpError(400, 'Check-in date is in the past.');
  if (!ignoreMin && nights < (item.min_nights || 1)) throw new HttpError(400, `This ${kind === 'rv' ? 'RV' : 'site'} has a ${item.min_nights}-night minimum.`);

  const base = kind === 'rv'
    ? tieredCost(nights, item.nightly_rate, item.weekly_rate, 0)
    : tieredCost(nights, item.nightly_rate, item.weekly_rate, item.monthly_rate);
  const catalog = kind === 'rv' ? settings.rv_addons : settings.lot_addons;
  const wanted = new Set(Array.isArray(addonIds) ? addonIds.map(String) : []);
  const addons = (catalog || []).filter(a => wanted.has(String(a.id))).map(a => ({
    id: a.id, name: a.name, price: Number(a.price), per: a.per,
    amount: round2(Number(a.price) * (a.per === 'night' ? nights : 1))
  }));
  const addonsTotal = round2(addons.reduce((s, a) => s + a.amount, 0));
  const fees = kind === 'rv' ? round2(item.cleaning_fee) : 0;
  const tax = round2((base + addonsTotal + fees) * Number(settings.tax_rate || 0));
  const total = round2(base + addonsTotal + fees + tax);
  const lines = [{ label: `${nights} night${nights > 1 ? 's' : ''} (avg $${(base / nights).toFixed(2)}/night)`, amount: base }];
  addons.forEach(a => lines.push({ label: a.name + (a.per === 'night' ? ` × ${nights}` : ''), amount: a.amount }));
  if (fees) lines.push({ label: 'Cleaning & prep fee', amount: fees });
  lines.push({ label: `Taxes (${(settings.tax_rate * 100).toFixed(1)}%)`, amount: tax });
  return {
    nights, start, end, base, addons, addons_total: addonsTotal, fees, tax, total, lines,
    deposit: kind === 'rv' ? round2(item.deposit) : 0,
    available: await isAvailable(kind, item.id, start, end, excludeId) && item.status === 'active'
  };
}

async function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let c = 'SC-';
    for (const b of crypto.randomBytes(6)) c += chars[b % chars.length];
    if (!await db.prepare('SELECT 1 FROM bookings WHERE code = ?').get(c)) return c;
  }
}

async function createBooking(body, { admin = false } = {}) {
  const kind = body.kind;
  const item = await getItem(kind, body.item_id);
  if (item.status !== 'active') throw new HttpError(409, `This ${kind === 'rv' ? 'RV' : 'site'} is not available for booking right now.`);
  if (kind === 'lot' && !admin && !await activeCampground(item.campground_id)) throw new HttpError(409, 'This campground is not taking bookings right now.');
  const name = str(body.name, 120), email = str(body.email, 160).toLowerCase(), phone = str(body.phone, 40);
  if (name.length < 2) throw new HttpError(400, 'Please enter your full name.');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (!admin && phone.replace(/\D/g, '').length < 7) throw new HttpError(400, 'Please enter a valid phone number.');
  const guests = Math.max(1, parseInt(body.guests, 10) || 1);
  if (kind === 'rv' && guests > item.sleeps) throw new HttpError(400, `${item.name} sleeps up to ${item.sleeps}.`);
  if (kind === 'lot' && guests > Number(getSettings().max_site_guests || 8)) throw new HttpError(400, 'Too many guests for one site.');
  let rigInfo = '';
  if (kind === 'lot') {
    const rigLen = parseInt(body.rig_length, 10) || 0;
    if (rigLen > item.max_length) throw new HttpError(400, `Site ${item.code} fits rigs up to ${item.max_length} ft.`);
    rigInfo = [str(body.rig_type, 60), rigLen ? `${rigLen} ft` : ''].filter(Boolean).join(' · ');
  }
  if (!admin && !body.agree) throw new HttpError(400, 'Please accept the rental terms and cancellation policy.');
  const q = await computeQuote(kind, item, body.start, body.end, body.addons, { ignoreMin: admin });
  const taken = admin ? 'Those dates aren’t available: they’re already booked or blocked.' : 'Sorry — those dates were just booked. Please choose different dates.';
  if (!q.available) throw new HttpError(409, taken);

  // Check availability and save in one statement, so two guests booking the same dates at the same moment
  // can't both succeed (the database runs one write at a time).
  const code = await genCode();
  const saved = await db.prepare(`INSERT INTO bookings (code, kind, item_id, start_date, end_date, nights, guests, customer_name, customer_email,
    customer_phone, rig_info, addons, base, addons_total, fees, tax, total, deposit, status, notes, source)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${FREE_SQL}`).run(
    code, kind, item.id, q.start, q.end, q.nights, guests, name, email, phone, rigInfo, JSON.stringify(q.addons),
    q.base, q.addons_total, q.fees, q.tax, q.total, q.deposit, admin && body.status === 'confirmed' ? 'confirmed' : 'pending',
    str(body.notes, 2000), admin ? 'admin' : 'web',
    kind, item.id, q.end, q.start, 0);
  if (!saved.changes) throw new HttpError(409, taken);
  return db.prepare('SELECT * FROM bookings WHERE code = ?').get(code);
}

async function unitName(b) {
  try { return await itemLabel(b.kind, await getItem(b.kind, b.item_id)); } catch { return b.kind === 'rv' ? 'RV rental' : 'RV site'; }
}

async function publicBooking(b) {
  const item = await db.prepare(`SELECT * FROM ${TABLE[b.kind]} WHERE id = ?`).get(b.item_id);
  const { admin_notes, stripe_session, hold_warned_at, ...rest } = hydrate(b);
  return { ...rest, hold_until: holdUntil(b), item_name: item ? await itemLabel(b.kind, item) : 'Unknown', item: item ? hydrate(item) : null };
}

// ---------- unpaid holds ----------
// A website request that staff haven't confirmed and that has no payment holds its dates for hold_days days.
// The guest is warned a day before, then the request is cancelled and the dates are freed. 0 turns this off.
const holdDays = () => Math.max(0, Math.min(30, parseInt(getSettings().hold_days, 10) || 0));
const isHeld = b => b.status === 'pending' && b.source === 'web' && b.amount_paid <= 0;
const holdUntil = b => holdDays() && isHeld(b) ? addDays(String(b.created_at).slice(0, 10), holdDays()) : null;
async function releaseUnpaidHolds() {
  const days = holdDays();
  if (!days) return { warned: 0, released: 0 };
  const held = `status = 'pending' AND source = 'web' AND amount_paid <= 0 AND start_date > ?`;
  let warned = 0, released = 0;
  // Release: past the hold, and (when holds are 2+ days) warned at least ~a day ago.
  const due = await db.prepare(`SELECT * FROM bookings WHERE ${held} AND created_at <= datetime('now', ?)
    AND (? < 2 OR hold_warned_at <= datetime('now', '-20 hours'))`).all(todayStr(), `-${days} days`, days);
  for (const b of due) {
    const r = await db.prepare(`UPDATE bookings SET status = 'cancelled', admin_notes = trim(coalesce(admin_notes, '') || ?) WHERE id = ? AND ${held}`)
      .run(` [Released automatically: no payment after ${days} days]`, b.id, todayStr());
    if (!r.changes) continue;
    released++;
    const nb = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(b.id), unit = await unitName(nb);
    mail.queue(mail.holdReleased, nb, unit);
    mail.queue(mail.staffHoldReleased, nb, unit, days);
  }
  // Warn: one day before the hold ends.
  if (days >= 2) {
    const soon = await db.prepare(`SELECT * FROM bookings WHERE ${held} AND hold_warned_at IS NULL AND created_at <= datetime('now', ?)`).all(todayStr(), `-${days - 1} days`);
    for (const b of soon) {
      const r = await db.prepare("UPDATE bookings SET hold_warned_at = datetime('now') WHERE id = ? AND hold_warned_at IS NULL").run(b.id);
      if (!r.changes) continue;
      warned++;
      mail.queue(mail.holdWarning, b, await unitName(b), addDays(todayStr(), 1));
    }
  }
  return { warned, released };
}

async function stripe(method, endpoint, params) {
  const res = await fetch('https://api.stripe.com/v1' + endpoint, {
    method,
    headers: { Authorization: 'Bearer ' + STRIPE_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params ? new URLSearchParams(params).toString() : undefined
  });
  const json = await res.json();
  if (!res.ok) throw new HttpError(502, json.error?.message || 'Payment provider error.');
  return json;
}
async function createCheckout(b) {
  const item = await getItem(b.kind, b.item_id);
  const session = await stripe('POST', '/checkout/sessions', {
    mode: 'payment',
    customer_email: b.customer_email,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(Math.round(b.total * 100)),
    'line_items[0][price_data][product_data][name]': `${await itemLabel(b.kind, item)} · ${b.start_date} → ${b.end_date}`,
    'line_items[0][price_data][product_data][description]': `STAYCAMPRV booking ${b.code}`,
    'metadata[code]': b.code,
    success_url: `${BASE_URL}/booking/${b.code}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/booking/${b.code}?cancelled_payment=1`
  });
  await db.prepare('UPDATE bookings SET stripe_session = ? WHERE id = ?').run(session.id, b.id);
  return session.url;
}

// ---------- auth ----------
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
async function requireAdmin(req, res, next) {
  const token = parseCookies(req).rf_session;
  const s = token && await db.prepare(`SELECT s.user_id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha(token), Date.now());
  if (!s) return res.status(401).json({ error: 'Please sign in.' });
  if (req.method !== 'GET' && req.get('X-RF-Admin') !== '1') return res.status(403).json({ error: 'Missing admin header.' });
  req.user = { id: s.user_id, email: s.email, name: s.name };
  await markStaffSeen();
  next();
}
function setSessionCookie(res, token, maxAge) {
  res.setHeader('Set-Cookie', `rf_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`);
}

// =================== PUBLIC API ===================
const api = express.Router();

// Settings the website may see. The business no longer takes calls, so no phone number is ever published.
function publicSettings() {
  const { notify_email, google_site_verification, phone, ...pub } = getSettings();
  pub.locations = (pub.locations || []).map(({ phone, ...l }) => l);
  return { ...pub, payments_enabled: Boolean(STRIPE_KEY) };
}
// Public listings change rarely, so let Vercel's CDN serve them for a short while instead of running the function
// (and querying the database) for every visitor. Bookings always re-check availability on the server.
const CDN_CACHE = 'public, max-age=0, s-maxage=30, stale-while-revalidate=300';
api.get(['/settings', '/rvs', '/rvs/:id', '/campgrounds', '/campgrounds/:id', '/lots', '/lots/:id', '/sales', '/sales/:id', '/testimonials', '/seo'], (req, res, next) => {
  res.setHeader('Cache-Control', CDN_CACHE);
  next();
});

api.get('/settings', (req, res) => res.json(publicSettings()));

api.get('/rvs', async (req, res) => {
  const { start, end } = req.query;
  const dated = isDate(start) && isDate(end) && end > start;
  const rows = (await db.prepare("SELECT * FROM rvs WHERE status != 'retired' ORDER BY featured DESC, nightly_rate DESC").all()).map(hydrate);
  const booked = dated ? await bookedIds('rv', start, end) : new Set();
  res.json(rows.map(r => ({ ...r, available: r.status === 'active' && !booked.has(r.id) })));
});
api.get('/rvs/:id', async (req, res) => {
  const rv = await getItem('rv', req.params.id);
  if (rv.status === 'retired') throw new HttpError(404, 'RV not found.');
  res.json({ ...rv, booked: await bookedRanges('rv', rv.id) });
});

// RV sites (pads) belong to campgrounds. Only active campgrounds and open sites are public.
const LOTS_SQL = `SELECT l.*, c.name AS campground_name, c.location AS campground_location FROM lots l
  JOIN campgrounds c ON c.id = l.campground_id WHERE l.status != 'closed' AND c.status = 'active'`;
async function withAvailability(rows, start, end) {
  const dated = isDate(start) && isDate(end) && end > start;
  const today = todayStr();
  const booked = await bookedIds('lot', dated ? start : today, dated ? end : addDays(today, 1));
  return rows.map(hydrate).map(l => ({ ...l, available: l.status === 'active' && !booked.has(l.id) }));
}
function campgroundSummary(c, lots) {
  const open = lots.filter(l => l.status === 'active');
  const rates = open.map(l => l.nightly_rate), monthly = open.map(l => l.monthly_rate).filter(Boolean);
  return {
    ...hydrate(c), pad_count: lots.length, available_count: open.filter(l => l.available).length,
    from_rate: rates.length ? Math.min(...rates) : null, monthly_from: monthly.length ? Math.min(...monthly) : null,
    max_length: lots.length ? Math.max(...lots.map(l => l.max_length || 0)) : null,
    sections: [...new Set(lots.map(l => l.section))]
  };
}
const activeCampground = id => db.prepare("SELECT * FROM campgrounds WHERE id = ? AND status = 'active'").get(Number(id));

api.get('/campgrounds', async (req, res) => {
  const { start, end } = req.query;
  const lots = await withAvailability(await db.prepare(`${LOTS_SQL} ORDER BY l.code`).all(), start, end);
  const camps = await db.prepare("SELECT * FROM campgrounds WHERE status = 'active' ORDER BY featured DESC, sort_order, name").all();
  res.json(camps.map(c => campgroundSummary(c, lots.filter(l => l.campground_id === c.id))));
});
api.get('/campgrounds/:id', async (req, res) => {
  const c = await activeCampground(req.params.id);
  if (!c) throw new HttpError(404, 'Campground not found.');
  const lots = await withAvailability(await db.prepare(`${LOTS_SQL} AND l.campground_id = ? ORDER BY l.section, l.code`).all(c.id), req.query.start, req.query.end);
  res.json({ ...campgroundSummary(c, lots), lots });
});
api.get('/lots', async (req, res) => {
  const cg = Number(req.query.campground) || 0;
  const rows = cg ? await db.prepare(`${LOTS_SQL} AND l.campground_id = ? ORDER BY l.code`).all(cg) : await db.prepare(`${LOTS_SQL} ORDER BY c.sort_order, c.name, l.code`).all();
  res.json(await withAvailability(rows, req.query.start, req.query.end));
});
api.get('/lots/:id', async (req, res) => {
  const lot = await getItem('lot', req.params.id);
  const c = await activeCampground(lot.campground_id);
  if (lot.status === 'closed' || !c) throw new HttpError(404, 'Site not found.');
  const { amenities, ...camp } = hydrate(c);
  res.json({ ...lot, campground_name: c.name, campground_location: c.location, campground: { ...camp, amenities }, booked: await bookedRanges('lot', lot.id) });
});

api.get('/sales', async (req, res) => {
  const rows = (await db.prepare(`SELECT * FROM sales WHERE status != 'sold' OR sold_at >= date('now', '-60 days')
    ORDER BY CASE status WHEN 'available' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, featured DESC, created_at DESC`).all()).map(hydrate);
  res.json(rows.map(({ sold_price, ...r }) => r));
});
api.get('/sales/:id', async (req, res) => {
  const row = await db.prepare('SELECT * FROM sales WHERE id = ?').get(Number(req.params.id));
  if (!row) throw new HttpError(404, 'Listing not found.');
  const { sold_price, ...rest } = hydrate(row);
  res.json(rest);
});

api.post('/quote', async (req, res) => {
  const { kind, item_id, start, end, addons } = req.body || {};
  const item = await getItem(kind, item_id);
  res.json(await computeQuote(kind, item, start, end, addons));
});

api.post('/bookings', rateLimit(10, 60000), async (req, res) => {
  const b = await createBooking(req.body || {});
  let checkout_url = null;
  if (STRIPE_KEY) {
    try { checkout_url = await createCheckout(b); } catch (e) { console.error('Stripe checkout failed:', e.message); }
  }
  const unit = await unitName(b);
  mail.queue(mail.bookingReceived, b, unit, { paymentLink: Boolean(checkout_url) });
  mail.queue(mail.staffNewBooking, b, unit);
  res.status(201).json({ booking: await publicBooking(b), checkout_url });
});

async function findBookingForCustomer(code, email) {
  const b = await db.prepare('SELECT * FROM bookings WHERE code = ?').get(str(code, 20).toUpperCase());
  if (!b || b.customer_email !== str(email, 160).toLowerCase()) throw new HttpError(404, 'We could not find a booking with that code and email.');
  return b;
}
// Guests can review a stay once it has started; one review per booking, approved by staff before it shows.
const canReview = async b => b.status !== 'cancelled' && b.start_date <= todayStr()
  && !await db.prepare('SELECT 1 FROM testimonials WHERE booking_code = ?').get(b.code);
api.get('/bookings/:code', rateLimit(30, 60000), async (req, res) => {
  const b = await findBookingForCustomer(req.params.code, req.query.email);
  res.json({ ...await publicBooking(b), can_review: await canReview(b) });
});
api.get('/testimonials', async (req, res) => {
  const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 12));
  res.json(await db.prepare(`SELECT id, name, location, quote, rating, stay, created_at FROM testimonials WHERE status = 'published'
    ORDER BY featured DESC, created_at DESC LIMIT ?`).all(limit));
});
api.post('/bookings/:code/review', rateLimit(5, 600000), async (req, res) => {
  const b = await findBookingForCustomer(req.params.code, req.body?.email);
  if (!await canReview(b)) throw new HttpError(409, b.start_date > todayStr() ? 'You can leave a review once your stay begins.' : 'A review has already been submitted for this booking.');
  const rating = Math.round(Number(req.body?.rating));
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Please choose a star rating.');
  const quote = str(req.body?.quote, 1500);
  if (quote.length < 15) throw new HttpError(400, 'Please write a few words about your stay.');
  const parts = b.customer_name.trim().split(/\s+/);
  const name = str(req.body?.name, 60) || (parts.length > 1 ? `${parts[0]} ${parts.at(-1)[0]}.` : parts[0]);
  const unit = await unitName(b);
  const t = { name, location: str(req.body?.location, 80), quote, rating, stay: `${b.kind === 'rv' ? 'Rented' : 'Stayed at'} ${unit.replace(/^RV Site /, 'Site ')}`, email: b.customer_email, booking_code: b.code };
  await db.prepare("INSERT INTO testimonials (name, location, quote, rating, stay, email, booking_code, source, status) VALUES (?,?,?,?,?,?,?, 'guest', 'pending')")
    .run(t.name, t.location, t.quote, t.rating, t.stay, t.email, t.booking_code);
  mail.queue(mail.staffReview, t);
  res.status(201).json({ ok: true });
});
api.post('/bookings/:code/cancel', rateLimit(10, 60000), async (req, res) => {
  const b = await findBookingForCustomer(req.params.code, req.body?.email);
  if (!['pending', 'confirmed'].includes(b.status)) throw new HttpError(409, 'This booking can no longer be cancelled online.');
  if (b.start_date <= todayStr()) throw new HttpError(409, 'Bookings that have already started cannot be cancelled online. Please call us.');
  await db.prepare("UPDATE bookings SET status = 'cancelled', admin_notes = trim(coalesce(admin_notes,'') || ' [Cancelled by guest ' || datetime('now') || ']') WHERE id = ?").run(b.id);
  const updated = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(b.id), unit = await unitName(updated);
  mail.queue(mail.bookingCancelled, updated, unit, { byGuest: true });
  mail.queue(mail.staffCancelled, updated, unit);
  res.json(await publicBooking(updated));
});
api.post('/bookings/:code/pay', rateLimit(10, 60000), async (req, res) => {
  const b = await findBookingForCustomer(req.params.code, req.body?.email);
  if (!STRIPE_KEY) throw new HttpError(400, 'Online payments are not enabled. You can pay at check-in.');
  if (b.payment_status === 'paid' || b.status === 'cancelled') throw new HttpError(409, 'This booking does not need payment.');
  res.json({ checkout_url: await createCheckout(b) });
});
api.get('/payments/verify', async (req, res) => {
  if (!STRIPE_KEY) throw new HttpError(400, 'Payments not enabled.');
  const session = await stripe('GET', `/checkout/sessions/${encodeURIComponent(str(req.query.session_id, 200))}`);
  const b = await db.prepare('SELECT * FROM bookings WHERE code = ?').get(session.metadata?.code || '');
  if (!b || b.stripe_session !== session.id) throw new HttpError(404, 'Booking not found for this payment.');
  if (session.payment_status === 'paid' && b.payment_status !== 'paid') {
    // Claim the payment first so a double page load can't record it twice.
    const r = await db.prepare(`UPDATE bookings SET payment_status = 'paid', status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END WHERE id = ? AND payment_status != 'paid'`).run(b.id);
    if (r.changes) {
      const amount = round2(session.amount_total / 100);
      await recordPayment(b.id, { amount, method: 'Card (online)', note: 'Stripe Checkout', by: 'Stripe' });
      const paid = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(b.id);
      mail.queue(mail.paymentReceived, paid, await unitName(paid), { amount, method: 'Card (online)', paid_on: todayStr() });
    }
  }
  res.json({ paid: session.payment_status === 'paid' });
});

api.post('/inquiries', rateLimit(6, 60000), async (req, res) => {
  const body = req.body || {};
  const listing = await db.prepare('SELECT id, status FROM sales WHERE id = ?').get(Number(body.listing_id));
  if (!listing) throw new HttpError(404, 'Listing not found.');
  const kind = ['info', 'offer', 'tour', 'financing'].includes(body.kind) ? body.kind : 'info';
  const name = str(body.name, 120), email = str(body.email, 160).toLowerCase();
  if (name.length < 2) throw new HttpError(400, 'Please enter your name.');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  const offer = kind === 'offer' ? Number(body.offer_amount) : null;
  if (kind === 'offer' && !(offer > 0)) throw new HttpError(400, 'Please enter your offer amount.');
  const inq = { kind, name, email, phone: str(body.phone, 40), message: str(body.message, 3000), offer_amount: offer, preferred_date: isDate(body.preferred_date) ? body.preferred_date : null };
  await db.prepare('INSERT INTO inquiries (listing_id, kind, name, email, phone, message, offer_amount, preferred_date) VALUES (?,?,?,?,?,?,?,?)')
    .run(listing.id, kind, name, email, inq.phone, inq.message, offer, inq.preferred_date);
  const title = (await db.prepare('SELECT title FROM sales WHERE id = ?').get(listing.id))?.title || 'our listing';
  mail.queue(mail.inquiryAck, { name, email, kind, listingTitle: title });
  mail.queue(mail.staffInquiry, inq, title);
  res.status(201).json({ ok: true });
});

api.post('/contact', rateLimit(5, 60000), async (req, res) => {
  const body = req.body || {};
  const name = str(body.name, 120), email = str(body.email, 160).toLowerCase(), message = str(body.message, 5000);
  if (name.length < 2) throw new HttpError(400, 'Please enter your name.');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (message.length < 5) throw new HttpError(400, 'Please write a short message.');
  const msg = { name, email, phone: str(body.phone, 40), subject: str(body.subject, 200), message };
  await db.prepare('INSERT INTO messages (name, email, phone, subject, message) VALUES (?,?,?,?,?)').run(name, email, msg.phone, msg.subject, message);
  mail.queue(mail.contactAck, msg);
  mail.queue(mail.staffMessage, msg);
  res.status(201).json({ ok: true });
});

// ---------- live chat (guest side) ----------
// Staff count as "online" while the admin is open (it pings every few seconds) unless they set themselves to away.
// Presence lives in the database so every server instance agrees on it.
const STAFF_WINDOW_MS = 45000;
let staffSeenWritten = 0;
const getRuntime = async key => (await db.prepare('SELECT value FROM runtime WHERE key = ?').get(key))?.value;
const setRuntime = (key, value) => db.prepare('INSERT INTO runtime (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
async function markStaffSeen() {
  if (Date.now() - staffSeenWritten < 10000) return;
  staffSeenWritten = Date.now();
  await setRuntime('staff_seen_at', staffSeenWritten);
}
const staffAway = async () => (await getRuntime('staff_away')) === '1';
const staffOnline = async () => !await staffAway() && Date.now() - Number(await getRuntime('staff_seen_at') || 0) < STAFF_WINDOW_MS;
const CHAT_MSG_COLS = 'id, sender, body, created_at';
// Email staff replies to guests who have left the site: once ~90s have passed since the last staff reply and the guest
// hasn't checked the chat, send everything they haven't seen in one email. Serverless functions can't run timers after
// responding, so this check runs whenever the admin pings for new chats (every few seconds while it is open).
const CHAT_EMAIL_DELAY_MS = 90000;
async function sendDueChatEmails() {
  const due = await db.prepare(`SELECT c.*, MAX(m.id) AS last_staff_id FROM chats c JOIN chat_messages m ON m.chat_id = c.id AND m.sender = 'staff'
    WHERE c.unread_guest > 0 AND c.guest_seen_at < ? GROUP BY c.id
    HAVING MAX(m.id) > c.emailed_up_to AND MAX(m.created_at) <= datetime('now', ?)`).all(Date.now() - CHAT_EMAIL_DELAY_MS + 5000, `-${CHAT_EMAIL_DELAY_MS / 1000} seconds`);
  for (const chat of due) {
    // Claim the email first so two instances checking at once can't both send it.
    const claimed = await db.prepare('UPDATE chats SET emailed_up_to = ? WHERE id = ? AND emailed_up_to = ?').run(chat.last_staff_id, chat.id, chat.emailed_up_to);
    if (!claimed.changes) continue;
    const unseen = await db.prepare("SELECT body FROM chat_messages WHERE chat_id = ? AND sender = 'staff' AND id > ? AND id <= ? ORDER BY id").all(chat.id, chat.emailed_up_to, chat.last_staff_id);
    if (unseen.length) mail.queue(mail.chatReply, chat, unseen.map(m => m.body));
  }
}
async function guestChat(req) {
  const token = String(req.get('X-Chat-Token') || '');
  const chat = token.length >= 32 && await db.prepare('SELECT * FROM chats WHERE token_hash = ?').get(sha(token));
  if (!chat) throw new HttpError(404, 'Chat not found. Please start a new conversation.');
  return chat;
}
async function addChatMessage(chatId, sender, body) {
  const r = await db.prepare('INSERT INTO chat_messages (chat_id, sender, body) VALUES (?,?,?)').run(chatId, sender, body);
  const bump = sender === 'guest' ? 'unread_staff = unread_staff + 1' : sender === 'staff' ? 'unread_guest = unread_guest + 1' : 'unread_staff = unread_staff';
  await db.prepare(`UPDATE chats SET ${bump}, updated_at = datetime('now')${sender === 'guest' ? ", status = 'open'" : ''} WHERE id = ?`).run(chatId);
  return db.prepare(`SELECT ${CHAT_MSG_COLS} FROM chat_messages WHERE id = ?`).get(r.lastInsertRowid);
}
const chatStatus = async () => { const st = getSettings(); return { online: await staffOnline(), hours: st.hours, email: st.email, support_email: st.support_email }; };

// Daily jobs, run by Vercel Cron (see vercel.json). Vercel sends CRON_SECRET as a bearer token when it is set.
api.get('/cron/daily', async (req, res) => {
  if (process.env.CRON_SECRET && req.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ holds: await releaseUnpaidHolds() });
});

api.get('/seo', async (req, res) => { const u = new URL(str(req.query.path, 500) || '/', 'http://x'); res.json(seoJson(await seoFor(u.pathname, u.search.slice(1)))); });

api.get('/chat/status', async (req, res) => res.json(await chatStatus()));

api.post('/chat/start', rateLimit(5, 600000), async (req, res) => {
  const body = req.body || {};
  const name = str(body.name, 120), email = str(body.email, 160).toLowerCase(), message = str(body.message, 2000);
  if (name.length < 2) throw new HttpError(400, 'Please enter your name.');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email so we can reply.');
  if (message.length < 2) throw new HttpError(400, 'Please type a message.');
  const callback = body.callback ? 1 : 0, phone = str(body.phone, 40);
  if (callback && phone.replace(/\D/g, '').length < 7) throw new HttpError(400, 'Please enter a phone number for the call back.');
  const token = crypto.randomBytes(24).toString('hex');
  const r = await db.prepare('INSERT INTO chats (token_hash, name, email, phone, topic, page, callback, guest_seen_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(sha(token), name, email, phone, str(body.topic, 80), str(body.page, 300), callback, Date.now());
  const id = Number(r.lastInsertRowid);
  await addChatMessage(id, 'guest', message);
  const first = name.split(' ')[0];
  const st = getSettings(), online = await staffOnline();
  if (!online) {
    const chat = await db.prepare('SELECT * FROM chats WHERE id = ?').get(id);
    mail.queue(mail.chatOfflineAck, chat, message);
    mail.queue(mail.staffChat, chat, message);
  }
  await addChatMessage(id, 'system', online
    ? `Thanks, ${first}! You're connected to the STAYCAMPRV team. Someone will reply here in a moment.`
    : `Thanks, ${first}! Our team is away right now (office hours: ${st.hours}). We'll reply right here and by email at ${email} as soon as we're back.`);
  res.status(201).json({ token, ...await chatStatus(), messages: await db.prepare(`SELECT ${CHAT_MSG_COLS} FROM chat_messages WHERE chat_id = ? ORDER BY id`).all(id) });
});

api.get('/chat/messages', rateLimit(90, 60000), async (req, res) => {
  const chat = await guestChat(req);
  if (Date.now() - chat.guest_seen_at > 15000) await db.prepare('UPDATE chats SET guest_seen_at = ? WHERE id = ?').run(Date.now(), chat.id);
  const after = Number(req.query.after) || 0;
  const messages = await db.prepare(`SELECT ${CHAT_MSG_COLS} FROM chat_messages WHERE chat_id = ? AND id > ? ORDER BY id`).all(chat.id, after);
  const seen = req.query.seen === '1';
  if (chat.unread_guest && seen) await db.prepare('UPDATE chats SET unread_guest = 0 WHERE id = ?').run(chat.id);
  res.json({ ...await chatStatus(), status: chat.status, name: chat.name, unread: seen ? 0 : chat.unread_guest, messages });
});

api.post('/chat/messages', rateLimit(20, 60000), async (req, res) => {
  const chat = await guestChat(req);
  const body = str(req.body?.body, 2000);
  if (!body) throw new HttpError(400, 'Please type a message.');
  res.status(201).json(await addChatMessage(chat.id, 'guest', body));
});

// ---------- auth routes ----------
api.post('/auth/login', rateLimit(8, 300000), async (req, res) => {
  const email = str(req.body?.email, 160).toLowerCase();
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(String(req.body?.password || ''), user.password_hash)) throw new HttpError(401, 'Incorrect email or password.');
  const token = crypto.randomBytes(32).toString('hex');
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  await db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha(token), user.id, Date.now() + SESSION_DAYS * 86400000);
  setSessionCookie(res, token, SESSION_DAYS * 86400);
  res.json({ email: user.email, name: user.name });
});
api.post('/auth/logout', async (req, res) => {
  const token = parseCookies(req).rf_session;
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
  setSessionCookie(res, '', 0);
  res.json({ ok: true });
});
api.get('/auth/me', requireAdmin, async (req, res) => res.json(req.user));

// =================== ADMIN API ===================
const admin = express.Router();
admin.use(requireAdmin);

const RV_TYPES = ['Class A Motorhome', 'Class B Camper Van', 'Class C Motorhome', 'Travel Trailer', 'Fifth Wheel', 'Toy Hauler', 'Pop-up Camper'];
const SCHEMAS = {
  rvs: {
    label: 'RV Fleet', title: 'name', fields: [
      { key: 'name', label: 'Display name', type: 'text', required: true },
      { key: 'type', label: 'RV type', type: 'select', options: RV_TYPES, required: true },
      { key: 'year', label: 'Year', type: 'int' }, { key: 'make', label: 'Make', type: 'text' }, { key: 'model', label: 'Model', type: 'text' },
      { key: 'sleeps', label: 'Sleeps', type: 'int', required: true }, { key: 'length_ft', label: 'Length (ft)', type: 'int' },
      { key: 'nightly_rate', label: 'Nightly rate ($)', type: 'real', required: true }, { key: 'weekly_rate', label: 'Weekly rate ($)', type: 'real' },
      { key: 'deposit', label: 'Security deposit ($)', type: 'real' }, { key: 'cleaning_fee', label: 'Cleaning fee ($)', type: 'real' },
      { key: 'pickup_location', label: 'Pickup location (city, state — e.g. Phoenix, AZ). Blank = main office', type: 'text' },
      { key: 'miles_per_night', label: 'Miles included / night (0 = towable)', type: 'int' }, { key: 'min_nights', label: 'Minimum nights', type: 'int' },
      { key: 'status', label: 'Status', type: 'select', options: ['active', 'maintenance', 'retired'] },
      { key: 'featured', label: 'Featured on home page', type: 'bool' },
      { key: 'color', label: 'Accent color', type: 'color' },
      { key: 'image_url', label: 'Photo', type: 'image' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'features', label: 'Features (one per line)', type: 'list' },
      { key: 'source_url', label: 'Imported from (link, staff only)', type: 'text' }
    ]
  },
  testimonials: {
    label: 'Testimonials', title: 'name', fields: [
      { key: 'name', label: 'Guest name as shown (e.g. Maria G.)', type: 'text', required: true },
      { key: 'location', label: 'Hometown (e.g. Tampa, FL)', type: 'text' },
      { key: 'rating', label: 'Rating', type: 'select', options: ['5', '4', '3', '2', '1'] },
      { key: 'status', label: 'Status', type: 'select', options: ['published', 'pending', 'hidden'] },
      { key: 'stay', label: 'What they booked (e.g. Rented the Coral Breeze)', type: 'text' },
      { key: 'featured', label: 'Featured on the home page', type: 'bool' },
      { key: 'quote', label: 'Testimonial', type: 'textarea', required: true },
      { key: 'email', label: 'Guest email (private, never shown)', type: 'text' },
      { key: 'booking_code', label: 'Booking code (if from a booking)', type: 'text' }
    ]
  },
  campgrounds: {
    label: 'Campgrounds', title: 'name', fields: [
      { key: 'name', label: 'Campground name', type: 'text', required: true },
      { key: 'location', label: 'City / area (e.g. Kissimmee, FL)', type: 'text', required: true },
      { key: 'address', label: 'Street address', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['active', 'hidden'] },
      { key: 'sort_order', label: 'Display order (1 = first)', type: 'int' },
      { key: 'featured', label: 'Featured (shown first)', type: 'bool' },
      { key: 'image_url', label: 'Photo', type: 'image' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'amenities', label: 'Amenities (one per line)', type: 'list' },
      { key: 'features', label: 'Highlights (one per line)', type: 'list' }
    ]
  },
  lots: {
    label: 'RV Sites', title: 'code', fields: [
      { key: 'campground_id', label: 'Campground', type: 'ref', ref: 'campgrounds', required: true },
      { key: 'code', label: 'Site / pad number (e.g. A-01)', type: 'text', required: true },
      { key: 'section', label: 'Section / row (e.g. Lakefront)', type: 'text', required: true },
      { key: 'site_type', label: 'Site type', type: 'select', options: ['Back-in', 'Pull-through', 'Premium'] },
      { key: 'max_length', label: 'Max rig length (ft)', type: 'int' },
      { key: 'amps', label: 'Electric', type: 'select', options: ['30', '50', '30/50'] },
      { key: 'water', label: 'Water hookup', type: 'bool' }, { key: 'sewer', label: 'Sewer hookup', type: 'bool' }, { key: 'wifi', label: 'Wi-Fi', type: 'bool' },
      { key: 'nightly_rate', label: 'Nightly rate ($)', type: 'real', required: true }, { key: 'weekly_rate', label: 'Weekly rate ($)', type: 'real' },
      { key: 'monthly_rate', label: 'Monthly rate ($)', type: 'real' }, { key: 'min_nights', label: 'Minimum nights', type: 'int' },
      { key: 'status', label: 'Status', type: 'select', options: ['active', 'maintenance', 'closed'] },
      { key: 'image_url', label: 'Photo', type: 'image' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'features', label: 'Features (one per line)', type: 'list' },
      { key: 'source_url', label: 'Imported from (link, staff only)', type: 'text' }
    ]
  },
  sales: {
    label: 'Sales Listings', title: 'title', fields: [
      { key: 'category', label: 'Category', type: 'select', options: ['rv', 'lot'], required: true },
      { key: 'title', label: 'Listing title', type: 'text', required: true },
      { key: 'type', label: 'Type (e.g. Class A, Deeded RV Lot)', type: 'text' },
      { key: 'price', label: 'Asking price ($)', type: 'real', required: true },
      { key: 'condition', label: 'Condition', type: 'select', options: ['New', 'Used', 'Certified Pre-Owned', 'Deeded', 'Leasehold'] },
      { key: 'status', label: 'Status', type: 'select', options: ['available', 'pending', 'sold'] },
      { key: 'sold_price', label: 'Final sale price ($)', type: 'real' },
      { key: 'year', label: 'Year', type: 'int' }, { key: 'make', label: 'Make', type: 'text' }, { key: 'model', label: 'Model', type: 'text' },
      { key: 'length_ft', label: 'Length (ft)', type: 'int' }, { key: 'mileage', label: 'Mileage', type: 'int' }, { key: 'sleeps', label: 'Sleeps', type: 'int' },
      { key: 'lot_size', label: 'Lot size', type: 'text' }, { key: 'location', label: 'Location', type: 'text' },
      { key: 'featured', label: 'Featured', type: 'bool' },
      { key: 'color', label: 'Accent color', type: 'color' },
      { key: 'image_url', label: 'Photo', type: 'image' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'features', label: 'Features (one per line)', type: 'list' },
      { key: 'source_url', label: 'Imported from (link, staff only)', type: 'text' }
    ]
  }
};

async function coerce(field, v) {
  if (v === undefined) return undefined;
  switch (field.type) {
    case 'int': return v === '' || v === null ? null : Math.round(Number(v));
    case 'real': return v === '' || v === null ? null : round2(v);
    case 'bool': return v ? 1 : 0;
    case 'list': return JSON.stringify((Array.isArray(v) ? v : String(v).split('\n')).map(s => str(s, 200)).filter(Boolean));
    case 'select': if (!field.options.includes(v)) throw new HttpError(400, `Invalid ${field.label}.`); return v;
    case 'ref': {
      if (v === '' || v === null) return null;
      const row = await db.prepare(`SELECT id FROM ${field.ref} WHERE id = ?`).get(Number(v));
      if (!row) throw new HttpError(400, `Please choose a ${field.label.toLowerCase()}.`);
      return row.id;
    }
    default: return str(v, field.type === 'textarea' ? 5000 : 300) || null;
  }
}
async function buildRecord(schema, body, partial) {
  const rec = {};
  for (const f of schema.fields) {
    const val = await coerce(f, body[f.key]);
    if (val === undefined) { if (!partial && f.required) throw new HttpError(400, `${f.label} is required.`); continue; }
    if (f.required && (val === null || val === '')) throw new HttpError(400, `${f.label} is required.`);
    if ((f.type === 'int' || f.type === 'real') && val !== null && (Number.isNaN(val) || val < 0)) throw new HttpError(400, `${f.label} must be a positive number.`);
    rec[f.key] = val;
  }
  return rec;
}

admin.get('/schema', async (req, res) => {
  // Reference fields get their choices at request time (e.g. the list of campgrounds).
  const out = {};
  for (const [k, sc] of Object.entries(SCHEMAS)) {
    out[k] = { ...sc, fields: await Promise.all(sc.fields.map(async f => f.type === 'ref'
      ? { ...f, options: (await db.prepare(`SELECT id, name FROM ${f.ref} ORDER BY sort_order, name`).all()).map(r => [r.id, r.name]) } : f)) };
  }
  res.json(out);
});

admin.get('/stats', async (req, res) => {
  // Also run the unpaid-hold check here, so it happens even if the daily job is delayed.
  await releaseUnpaidHolds();
  const today = todayStr(), week = addDays(today, 7), month = today.slice(0, 7);
  const live = "status NOT IN ('cancelled')";
  // Each query is a network round trip to the database, so run them all at once.
  const one = async (sql, ...p) => Object.values(await db.prepare(sql).get(...p))[0];
  const months = [5, 4, 3, 2, 1, 0].map(i => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const withName = sql => db.prepare(`SELECT b.*, CASE b.kind WHEN 'rv' THEN COALESCE((SELECT name FROM rvs WHERE id = b.item_id), '?')
    ELSE 'Site ' || COALESCE((SELECT code FROM lots WHERE id = b.item_id), '?') END AS item_name FROM bookings b WHERE ${sql}`).all(today, week);
  const [lotsTotal, lotsOcc, fleet, rvsOut, monthRevenue, collected, ytdSales, pendingBookings, pendingReviews, newInquiries, newMessages,
    unreadChats, activeListings, arrivals, departures, ...monthly] = await Promise.all([
    one("SELECT COUNT(*) c FROM lots WHERE status = 'active'"),
    one(`SELECT COUNT(DISTINCT item_id) c FROM bookings WHERE kind='lot' AND ${live} AND start_date <= ? AND end_date > ?`, today, today),
    one("SELECT COUNT(*) c FROM rvs WHERE status = 'active'"),
    one(`SELECT COUNT(DISTINCT item_id) c FROM bookings WHERE kind='rv' AND ${live} AND start_date <= ? AND end_date > ?`, today, today),
    one(`SELECT COALESCE(SUM(total),0) s FROM bookings WHERE ${live} AND substr(start_date,1,7) = ?`, month),
    one(`SELECT COALESCE(SUM(amount_paid),0) s FROM bookings WHERE ${live} AND substr(start_date,1,7) = ?`, month),
    one("SELECT COALESCE(SUM(COALESCE(sold_price, price)),0) s FROM sales WHERE status='sold' AND substr(sold_at,1,4) = ?", today.slice(0, 4)),
    one("SELECT COUNT(*) c FROM bookings WHERE status = 'pending'"),
    one("SELECT COUNT(*) c FROM testimonials WHERE status = 'pending'"),
    one("SELECT COUNT(*) c FROM inquiries WHERE status = 'new'"),
    one("SELECT COUNT(*) c FROM messages WHERE status = 'new'"),
    one('SELECT COUNT(*) c FROM chats WHERE unread_staff > 0'),
    one("SELECT COUNT(*) c FROM sales WHERE status != 'sold'"),
    withName(`b.${live} AND b.status != 'checked_in' AND b.start_date >= ? AND b.start_date <= ? ORDER BY b.start_date`),
    withName(`b.${live} AND b.end_date >= ? AND b.end_date <= ? AND b.status IN ('checked_in','confirmed') ORDER BY b.end_date`),
    ...months.flatMap(ym => [
      one(`SELECT COALESCE(SUM(total),0) s FROM bookings WHERE ${live} AND substr(start_date,1,7) = ?`, ym),
      one("SELECT COALESCE(SUM(COALESCE(sold_price, price)),0) s FROM sales WHERE status='sold' AND substr(sold_at,1,7) = ?", ym)
    ])
  ]);
  res.json({
    month_rental_revenue: round2(monthRevenue),
    collected_this_month: round2(collected),
    ytd_sales: round2(ytdSales),
    lot_occupancy: { occupied: lotsOcc, total: lotsTotal },
    fleet_out: { out: rvsOut, total: fleet },
    pending_bookings: pendingBookings,
    pending_reviews: pendingReviews,
    new_inquiries: newInquiries,
    new_messages: newMessages,
    unread_chats: unreadChats,
    active_listings: activeListings,
    revenue: months.map((month, i) => ({ month, rentals: round2(monthly[i * 2]), sales: round2(monthly[i * 2 + 1]) })),
    arrivals,
    departures
  });
});

const BOOKINGS_SQL = `SELECT b.*, CASE b.kind WHEN 'rv' THEN (SELECT name FROM rvs WHERE id = b.item_id)
  ELSE (SELECT 'Site ' || l.code || COALESCE(' · ' || c.name, '') FROM lots l LEFT JOIN campgrounds c ON c.id = l.campground_id WHERE l.id = b.item_id) END AS item_name FROM bookings b`;
admin.get('/bookings', async (req, res) => {
  res.json((await db.prepare(`${BOOKINGS_SQL} ORDER BY b.start_date DESC`).all()).map(hydrate));
});
admin.post('/bookings', async (req, res) => {
  const b = await createBooking(req.body || {}, { admin: true });
  if (req.body?.notify !== false) mail.queue(mail.bookingReceived, b, await unitName(b));
  res.status(201).json(hydrate(await db.prepare(`${BOOKINGS_SQL} WHERE b.id = ?`).get(b.id)));
});
admin.post('/quote', async (req, res) => {
  const { kind, item_id, start, end, addons } = req.body || {};
  res.json(await computeQuote(kind, await getItem(kind, item_id), start, end, addons, { ignoreMin: true }));
});
admin.patch('/bookings/:id', async (req, res) => {
  const b = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(req.params.id));
  if (!b) throw new HttpError(404, 'Booking not found.');
  const body = req.body || {};
  const status = body.status ?? b.status;
  if (!['pending', 'confirmed', 'checked_in', 'completed', 'cancelled'].includes(status)) throw new HttpError(400, 'Invalid status.');
  const notes = body.admin_notes !== undefined ? str(body.admin_notes, 3000) : b.admin_notes;
  if (b.status === 'cancelled' && status !== 'cancelled') {
    // Restoring a cancelled booking: only if its dates are still free, checked and saved in one statement.
    const r = await db.prepare(`UPDATE bookings SET status = ?, admin_notes = ? WHERE id = ? AND ${FREE_SQL}`)
      .run(status, notes, b.id, b.kind, b.item_id, b.end_date, b.start_date, b.id);
    if (!r.changes) throw new HttpError(409, 'Cannot restore: those dates have since been booked or blocked.');
  } else {
    await db.prepare('UPDATE bookings SET status = ?, admin_notes = ? WHERE id = ?').run(status, notes, b.id);
  }
  if (body.notify !== false) {
    const nb = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(b.id), unit = await unitName(nb);
    if (status === 'cancelled' && b.status !== 'cancelled') mail.queue(mail.bookingCancelled, nb, unit);
    else if (status === 'confirmed' && b.status === 'pending') mail.queue(mail.bookingConfirmed, nb, unit);
    if (status === 'completed' && b.status !== 'completed' && await canReview(nb)) mail.queue(mail.reviewRequest, nb, unit);
  }
  res.json(hydrate(await db.prepare(`${BOOKINGS_SQL} WHERE b.id = ?`).get(b.id)));
});

// ---------- payments (collected by staff, recorded here) ----------
const PAY_METHODS = ['Cash', 'Card (in person)', 'Zelle', 'Bank transfer', 'Check', 'Card (online)', 'Other'];
const paymentsOf = id => db.prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY paid_on, id').all(id);
// A booking's amount paid and payment status always follow its payment history (refunds are negative amounts).
async function syncPayments(bookingId) {
  const { total } = await db.prepare('SELECT total FROM bookings WHERE id = ?').get(bookingId);
  const { sum, refunds } = await db.prepare('SELECT COALESCE(SUM(amount), 0) AS sum, COUNT(CASE WHEN amount < 0 THEN 1 END) AS refunds FROM payments WHERE booking_id = ?').get(bookingId);
  const paid = round2(sum);
  const status = paid > 0 && paid >= round2(total) ? 'paid' : paid > 0 ? 'partial' : refunds ? 'refunded' : 'unpaid';
  await db.prepare('UPDATE bookings SET amount_paid = ?, payment_status = ? WHERE id = ?').run(paid, status, bookingId);
}
async function recordPayment(bookingId, { amount, method, note = '', paid_on = todayStr(), by = '' }) {
  await db.prepare('INSERT INTO payments (booking_id, amount, method, note, paid_on, recorded_by) VALUES (?,?,?,?,?,?)')
    .run(bookingId, round2(amount), method, note, paid_on, by);
  await syncPayments(bookingId);
}
const bookingWithPayments = async id => ({ booking: hydrate(await db.prepare(`${BOOKINGS_SQL} WHERE b.id = ?`).get(id)), payments: await paymentsOf(id) });

admin.get('/bookings/:id/payments', async (req, res) => res.json({ methods: PAY_METHODS, payments: await paymentsOf(Number(req.params.id)) }));
admin.post('/bookings/:id/payments', async (req, res) => {
  const b = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(req.params.id));
  if (!b) throw new HttpError(404, 'Booking not found.');
  const body = req.body || {};
  const refund = body.type === 'refund';
  const amount = round2(body.amount);
  if (!(amount > 0 && amount < 1e6)) throw new HttpError(400, 'Enter an amount greater than $0.');
  if (refund && amount > b.amount_paid + 0.001) throw new HttpError(400, `You can refund at most ${'$' + b.amount_paid.toFixed(2)} (the amount paid so far).`);
  const method = PAY_METHODS.includes(body.method) ? body.method : 'Other';
  const paid_on = isDate(body.paid_on) && body.paid_on <= addDays(todayStr(), 1) ? body.paid_on : todayStr();
  await recordPayment(b.id, { amount: refund ? -amount : amount, method, note: str(body.note, 300), paid_on, by: req.user.email });
  if (!refund && body.receipt !== false) {
    const nb = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(b.id);
    mail.queue(mail.paymentReceived, nb, await unitName(nb), { amount, method, paid_on });
  }
  res.status(201).json(await bookingWithPayments(b.id));
});
admin.delete('/payments/:id', async (req, res) => {
  const p = await db.prepare('SELECT booking_id FROM payments WHERE id = ?').get(Number(req.params.id));
  if (!p) throw new HttpError(404, 'Payment not found.');
  await db.prepare('DELETE FROM payments WHERE id = ?').run(Number(req.params.id));
  await syncPayments(p.booking_id);
  res.json(await bookingWithPayments(p.booking_id));
});

// ---------- blocked dates (maintenance, owner use) ----------
admin.get('/blocks', async (req, res) => {
  res.json(await db.prepare(`SELECT bl.*, CASE bl.kind WHEN 'rv' THEN (SELECT name FROM rvs WHERE id = bl.item_id)
    ELSE (SELECT 'Site ' || code FROM lots WHERE id = bl.item_id) END AS item_name FROM blocks bl
    WHERE bl.end_date >= date('now', '-60 days') ORDER BY bl.start_date`).all());
});
admin.post('/blocks', async (req, res) => {
  const { kind, item_id, start, end } = req.body || {};
  const item = await getItem(kind, item_id);
  if (!isDate(start) || !isDate(end) || end <= start) throw new HttpError(400, 'Choose a start date and a later end date.');
  if (nightsBetween(start, end) > 730) throw new HttpError(400, 'Blocks are limited to two years.');
  const clash = await db.prepare(`SELECT code FROM bookings WHERE kind = ? AND item_id = ? AND status != 'cancelled' AND start_date < ? AND end_date > ?`).all(kind, item.id, end, start);
  if (clash.length) throw new HttpError(409, `Those dates overlap booking${clash.length > 1 ? 's' : ''} ${clash.map(c => c.code).join(', ')}. Move or cancel ${clash.length > 1 ? 'them' : 'it'} first.`);
  await db.prepare('INSERT INTO blocks (kind, item_id, start_date, end_date, reason) VALUES (?,?,?,?,?)').run(kind, item.id, start, end, str(req.body.reason, 200));
  res.status(201).json({ ok: true });
});
admin.delete('/blocks/:id', async (req, res) => {
  await db.prepare('DELETE FROM blocks WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});
admin.post('/bookings/:id/email', async (req, res) => {
  const b = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(req.params.id));
  if (!b) throw new HttpError(404, 'Booking not found.');
  if (!mail.mailEnabled()) throw new HttpError(400, 'Email is not set up. Add RESEND_API_KEY to the .env file.');
  const unit = await unitName(b);
  const r = b.status === 'cancelled' ? await mail.bookingCancelled(b, unit) : b.status === 'pending' ? await mail.bookingReceived(b, unit) : await mail.bookingConfirmed(b, unit);
  if (!r.ok) throw new HttpError(502, 'Email failed: ' + r.error);
  res.json({ ok: true, to: b.customer_email });
});

// ---------- email settings, test and log ----------
admin.get('/email', async (req, res) => {
  res.json({ enabled: mail.mailEnabled(), from: mail.mailFrom(), staff_to: mail.staffAddress(), reply_to: mail.replyAddress(), user_email: req.user.email,
    log: await db.prepare('SELECT * FROM email_log ORDER BY id DESC LIMIT 40').all() });
});
admin.post('/email/test', async (req, res) => {
  if (!mail.mailEnabled()) throw new HttpError(400, 'Email is not set up. Add RESEND_API_KEY to the .env file.');
  const to = str(req.body?.to, 160).toLowerCase();
  if (!EMAIL_RE.test(to)) throw new HttpError(400, 'Enter a valid email address.');
  const r = await mail.testEmail(to);
  if (!r.ok) throw new HttpError(502, 'Email failed: ' + r.error);
  res.json({ ok: true });
});

admin.get('/export/bookings.csv', async (req, res) => {
  const rows = await db.prepare(`${BOOKINGS_SQL} ORDER BY b.start_date`).all();
  const cols = ['code', 'kind', 'item_name', 'start_date', 'end_date', 'nights', 'guests', 'customer_name', 'customer_email', 'customer_phone',
    'rig_info', 'base', 'addons_total', 'fees', 'tax', 'total', 'deposit', 'amount_paid', 'payment_status', 'status', 'source', 'created_at'];
  const cell = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="staycamp-bookings-${todayStr()}.csv"`);
  res.send([cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n'));
});

for (const [resource, schema] of Object.entries(SCHEMAS)) {
  const LIST_SQL = {
    lots: 'SELECT l.*, c.name AS campground_name FROM lots l LEFT JOIN campgrounds c ON c.id = l.campground_id ORDER BY c.sort_order, c.name, l.code',
    testimonials: "SELECT * FROM testimonials ORDER BY status = 'pending' DESC, created_at DESC",
    campgrounds: `SELECT c.*, (SELECT COUNT(*) FROM lots l WHERE l.campground_id = c.id) AS pad_count,
      (SELECT MIN(nightly_rate) FROM lots l WHERE l.campground_id = c.id AND l.status = 'active') AS from_rate FROM campgrounds c ORDER BY c.sort_order, c.name`
  };
  admin.get(`/${resource}`, async (req, res) => res.json((await db.prepare(LIST_SQL[resource] || `SELECT * FROM ${resource} ORDER BY id`).all())
    .map(r => ({ ...hydrate(r), ...(r.source_url !== undefined ? { source_url: r.source_url } : {}) }))));
  admin.post(`/${resource}`, async (req, res) => {
    const rec = await buildRecord(schema, req.body || {}, false);
    if (resource === 'sales' && rec.status === 'sold') rec.sold_at = todayStr();
    const keys = Object.keys(rec);
    try {
      const r = await db.prepare(`INSERT INTO ${resource} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => rec[k]));
      res.status(201).json(hydrate(await db.prepare(`SELECT * FROM ${resource} WHERE id = ?`).get(r.lastInsertRowid)));
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'That site number already exists in this campground.');
      throw e;
    }
  });
  admin.put(`/${resource}/:id`, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await db.prepare(`SELECT * FROM ${resource} WHERE id = ?`).get(id);
    if (!existing) throw new HttpError(404, 'Not found.');
    const rec = await buildRecord(schema, req.body || {}, true);
    if (resource === 'sales') {
      if (rec.status === 'sold' && existing.status !== 'sold') rec.sold_at = todayStr();
      if (rec.status && rec.status !== 'sold') rec.sold_at = null;
    }
    const keys = Object.keys(rec);
    if (keys.length) {
      try {
        await db.prepare(`UPDATE ${resource} SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(k => rec[k]), id);
      } catch (e) {
        if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'That site number already exists in this campground.');
        throw e;
      }
    }
    res.json(hydrate(await db.prepare(`SELECT * FROM ${resource} WHERE id = ?`).get(id)));
  });
  admin.delete(`/${resource}/:id`, async (req, res) => {
    const id = Number(req.params.id);
    if (resource === 'campgrounds') {
      const { c } = await db.prepare('SELECT COUNT(*) c FROM lots WHERE campground_id = ?').get(id);
      if (c > 0) throw new HttpError(409, `This campground has ${c} site(s). Delete or move them first, or set the campground to "hidden".`);
    } else if (resource === 'rvs' || resource === 'lots') {
      const kind = resource === 'rvs' ? 'rv' : 'lot';
      const { c } = await db.prepare('SELECT COUNT(*) c FROM bookings WHERE kind = ? AND item_id = ?').get(kind, id);
      if (c > 0) throw new HttpError(409, `This item has ${c} booking(s) on record. Set its status to "${resource === 'rvs' ? 'retired' : 'closed'}" instead of deleting it.`);
    } else {
      await db.prepare('UPDATE inquiries SET listing_id = NULL WHERE listing_id = ?').run(id);
    }
    await db.prepare(`DELETE FROM ${resource} WHERE id = ?`).run(id);
    res.json({ ok: true });
  });
}

admin.get('/inquiries', async (req, res) => {
  res.json(await db.prepare(`SELECT i.*, s.title AS listing_title, s.price AS listing_price FROM inquiries i
    LEFT JOIN sales s ON s.id = i.listing_id ORDER BY i.created_at DESC`).all());
});
admin.get('/messages', async (req, res) => res.json(await db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all()));
for (const t of ['inquiries', 'messages']) {
  admin.patch(`/${t}/:id`, async (req, res) => {
    const status = req.body?.status;
    if (!['new', 'contacted', 'closed'].includes(status)) throw new HttpError(400, 'Invalid status.');
    await db.prepare(`UPDATE ${t} SET status = ? WHERE id = ?`).run(status, Number(req.params.id));
    res.json({ ok: true });
  });
  admin.delete(`/${t}/:id`, async (req, res) => { await db.prepare(`DELETE FROM ${t} WHERE id = ?`).run(Number(req.params.id)); res.json({ ok: true }); });
}

// ---------- live chat (staff side) ----------
admin.get('/chats/pulse', async (req, res) => {
  await sendDueChatEmails();
  const [online, away, counts] = await Promise.all([staffOnline(), staffAway(), db.prepare(`SELECT
    (SELECT COALESCE(SUM(unread_staff),0) FROM chats) AS unread, (SELECT COUNT(*) FROM chats WHERE unread_staff > 0) AS waiting,
    (SELECT COALESCE(MAX(id),0) FROM chat_messages) AS latest`).get()]);
  res.json({ online, away, ...counts });
});
admin.post('/chats/presence', async (req, res) => {
  await setRuntime('staff_away', req.body?.away ? '1' : '0');
  res.json({ online: await staffOnline(), away: await staffAway() });
});
admin.get('/chats', async (req, res) => {
  res.json(await db.prepare(`SELECT c.id, c.name, c.email, c.phone, c.topic, c.page, c.callback, c.status, c.unread_staff, c.created_at, c.updated_at,
    (SELECT body FROM chat_messages m WHERE m.chat_id = c.id AND m.sender != 'system' ORDER BY m.id DESC LIMIT 1) AS last_body,
    (SELECT sender FROM chat_messages m WHERE m.chat_id = c.id AND m.sender != 'system' ORDER BY m.id DESC LIMIT 1) AS last_sender
    FROM chats c ORDER BY c.status = 'closed', c.updated_at DESC, c.id DESC LIMIT 200`).all());
});
admin.get('/chats/:id', async (req, res) => {
  const id = Number(req.params.id);
  const chat = await db.prepare('SELECT id, name, email, phone, topic, page, callback, status, created_at FROM chats WHERE id = ?').get(id);
  if (!chat) throw new HttpError(404, 'Chat not found.');
  await db.prepare('UPDATE chats SET unread_staff = 0 WHERE id = ?').run(id);
  const after = Number(req.query.after) || 0;
  res.json({ ...chat, messages: await db.prepare(`SELECT ${CHAT_MSG_COLS} FROM chat_messages WHERE chat_id = ? AND id > ? ORDER BY id`).all(id, after) });
});
admin.post('/chats/:id/messages', async (req, res) => {
  const id = Number(req.params.id);
  if (!await db.prepare('SELECT id FROM chats WHERE id = ?').get(id)) throw new HttpError(404, 'Chat not found.');
  const body = str(req.body?.body, 4000);
  if (!body) throw new HttpError(400, 'Type a reply first.');
  res.status(201).json(await addChatMessage(id, 'staff', body));
});
admin.patch('/chats/:id', async (req, res) => {
  const status = req.body?.status;
  if (!['open', 'closed'].includes(status)) throw new HttpError(400, 'Invalid status.');
  const id = Number(req.params.id);
  await db.prepare('UPDATE chats SET status = ? WHERE id = ?').run(status, id);
  if (status === 'closed') await addChatMessage(id, 'system', 'This conversation was marked as resolved. Send a message anytime to reopen it.');
  res.json({ ok: true });
});
admin.delete('/chats/:id', async (req, res) => {
  await db.prepare('DELETE FROM chat_messages WHERE chat_id = ?').run(Number(req.params.id));
  await db.prepare('DELETE FROM chats WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

admin.get('/settings', async (req, res) => res.json(getSettings()));
admin.put('/settings', async (req, res) => {
  const body = req.body || {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in body)) continue;
    let v = body[key];
    if (key === 'tax_rate') { v = Number(v); if (!(v >= 0 && v < 0.5)) throw new HttpError(400, 'Tax rate must be between 0 and 0.5 (e.g. 0.07 for 7%).'); }
    if (key === 'max_site_guests') v = Math.max(1, parseInt(v, 10) || 1);
    if (key === 'hold_days') { v = parseInt(v, 10); if (!(v >= 0 && v <= 30)) throw new HttpError(400, 'Hold days must be between 0 and 30 (0 turns automatic release off).'); }
    if (key === 'rv_addons' || key === 'lot_addons') {
      if (!Array.isArray(v)) throw new HttpError(400, 'Invalid add-ons.');
      v = v.filter(a => str(a.name)).map((a, i) => ({
        id: str(a.id, 40) || `${str(a.name, 30).toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${i}`,
        name: str(a.name, 120), price: round2(a.price), per: a.per === 'night' ? 'night' : 'stay'
      }));
    }
    if (key === 'faq') { if (!Array.isArray(v)) throw new HttpError(400, 'Invalid FAQ.'); v = v.filter(f => str(f.q)).map(f => ({ q: str(f.q, 300), a: str(f.a, 2000) })); }
    if (key === 'amenities') { if (!Array.isArray(v)) throw new HttpError(400, 'Invalid amenities.'); v = v.map(a => str(a, 100)).filter(Boolean); }
    if (['seo_title', 'seo_description', 'google_site_verification'].includes(key)) v = str(v, key === 'seo_description' ? 300 : 200).replace(/^.*content="([^"]+)".*$/s, '$1');
    if (key === 'locations') {
      if (!Array.isArray(v)) throw new HttpError(400, 'Invalid locations.');
      const R = globalThis.RFRegions;
      v = v.filter(l => R.STATES[String(l.state || '').toUpperCase()]).map(l => ({
        state: String(l.state).toUpperCase(), role: R.ROLES.includes(l.role) ? l.role : 'Location',
        city: str(l.city, 80), blurb: str(l.blurb, 400)
      }));
      if (new Set(v.map(l => l.state)).size !== v.length) throw new HttpError(400, 'Each state can only be listed once in Locations.');
    }
    if (key === 'support_email') { v = str(v, 160).toLowerCase(); if (v && !EMAIL_RE.test(v)) throw new HttpError(400, 'Support email is not a valid address.'); }
    if (key === 'notify_email') { v = str(v, 160).toLowerCase(); if (v && !EMAIL_RE.test(v)) throw new HttpError(400, 'Staff notification email is not a valid address.'); }
    if (typeof v === 'string') v = str(v, 5000);
    await setSetting(key, v);
  }
  res.json(getSettings());
});
admin.post('/password', async (req, res) => {
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(req.body?.current || ''), user.password_hash)) throw new HttpError(400, 'Current password is incorrect.');
  const next = String(req.body?.next || '');
  if (next.length < 10) throw new HttpError(400, 'New password must be at least 10 characters.');
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), user.id);
  res.json({ ok: true });
});
// Fill in an add form from a listing link (RV n' GO, RVProperty, others) or text pasted from a listing.
admin.post('/import', async (req, res) => {
  const body = req.body || {};
  try {
    res.json(await importListing({ target: body.target, url: str(body.url, 1000), text: str(body.text, 20000), photoUrl: str(body.photo_url, 1000) }));
  } catch (e) {
    if (e instanceof ImportError) throw new HttpError(422, e.message);
    throw e;
  }
});
admin.post('/upload', async (req, res) => {
  const m = /^data:(image\/(png|jpeg|webp|gif));base64,(.+)$/.exec(String(req.body?.data || ''));
  if (!m) throw new HttpError(400, 'Please upload a PNG, JPG, WebP or GIF image.');
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw new HttpError(400, 'Images must be under 3 MB.');
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`;
  await db.prepare('INSERT INTO uploads (name, type, data) VALUES (?, ?, ?)').run(name, m[1], buf);
  res.status(201).json({ url: `/uploads/${name}` });
});

api.use('/admin', admin);
app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Every public page is rendered with its own title, description, canonical URL, structured data and crawlable content.
// The template lives outside public/ so the CDN never serves it unrendered.
const PAGE_TEMPLATE = fs.readFileSync(path.join(__dirname, 'views', 'index.html'), 'utf8');
app.get(/^\/(?!api\/|uploads\/|admin)[^.]*$/, async (req, res) => {
  const seo = await seoFor(req.path, new URLSearchParams(req.query).toString());
  // Ship the site settings with the page so the app can draw it immediately, without another request first.
  let head = `<script>window.RF_SETTINGS = ${JSON.stringify(publicSettings()).replaceAll("<", String.fromCharCode(92) + "u003c")};</script>`;
  // Start downloading the home page's hero photo right away, instead of after the scripts run.
  if (req.path === '/') head += '\n  <link rel="preload" as="image" href="/img/photos/hero-lakeside.jpg" fetchpriority="high">';
  if (seo.status === 200 && !/^\/(manage|booking)(\/|$)/.test(req.path)) res.setHeader('Cache-Control', CDN_CACHE);
  res.status(seo.status).type('html').send(renderPage(PAGE_TEMPLATE, seo).replace('</head>', `  ${head}\n</head>`));
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Upload is too large.' });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Invalid request.' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our end. Please try again.' : err.message });
});

export default app;
export { BASE_URL, PORT, STRIPE_KEY };
