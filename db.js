// Database layer for STAYCAMPRV LLC. Uses libSQL (SQLite): a local file in development, or a hosted
// Turso database when DATABASE_URL is set (required on Vercel, where the filesystem is not persistent).
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DB_FILE = path.join(DATA_DIR, 'riseflorals.db');
export const SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const DATABASE_URL = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || '';
if (!DATABASE_URL && SERVERLESS) throw new Error('DATABASE_URL is not set. Add your Turso database URL and DATABASE_AUTH_TOKEN in the Vercel project settings.');
if (!DATABASE_URL) fs.mkdirSync(DATA_DIR, { recursive: true });
export const client = createClient({
  url: DATABASE_URL || pathToFileURL(DB_FILE).href,
  authToken: process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined
});

// A small prepared-statement style wrapper so queries read like before: await db.prepare(sql).get(...args)
const rowsOf = rs => rs.rows.map(r => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));
const argsOf = a => a.map(v => (v === undefined ? null : v));
export const db = {
  prepare: sql => ({
    all: async (...a) => rowsOf(await client.execute({ sql, args: argsOf(a) })),
    get: async (...a) => rowsOf(await client.execute({ sql, args: argsOf(a) }))[0],
    run: async (...a) => {
      const r = await client.execute({ sql, args: argsOf(a) });
      return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid === undefined ? undefined : Number(r.lastInsertRowid) };
    }
  }),
  exec: sql => client.executeMultiple(sql)
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rvs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  year INTEGER, make TEXT, model TEXT,
  sleeps INTEGER DEFAULT 2,
  length_ft INTEGER,
  nightly_rate REAL NOT NULL,
  weekly_rate REAL,
  deposit REAL DEFAULT 0,
  cleaning_fee REAL DEFAULT 0,
  miles_per_night INTEGER DEFAULT 100,
  pickup_location TEXT,
  min_nights INTEGER DEFAULT 2,
  description TEXT,
  features TEXT DEFAULT '[]',
  color TEXT DEFAULT '#F26B3A',
  image_url TEXT,
  status TEXT DEFAULT 'active',
  featured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS campgrounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT,
  address TEXT,
  description TEXT,
  amenities TEXT DEFAULT '[]',
  features TEXT DEFAULT '[]',
  image_url TEXT,
  status TEXT DEFAULT 'active',
  featured INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campground_id INTEGER REFERENCES campgrounds(id),
  code TEXT NOT NULL,
  section TEXT NOT NULL,
  site_type TEXT DEFAULT 'Back-in',
  max_length INTEGER DEFAULT 40,
  amps TEXT DEFAULT '30/50',
  water INTEGER DEFAULT 1,
  sewer INTEGER DEFAULT 1,
  wifi INTEGER DEFAULT 1,
  nightly_rate REAL NOT NULL,
  weekly_rate REAL,
  monthly_rate REAL,
  min_nights INTEGER DEFAULT 1,
  description TEXT,
  features TEXT DEFAULT '[]',
  image_url TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (campground_id, code)
);
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL DEFAULT 'rv',
  title TEXT NOT NULL,
  type TEXT,
  year INTEGER, make TEXT, model TEXT,
  length_ft INTEGER, mileage INTEGER, sleeps INTEGER,
  price REAL NOT NULL,
  condition TEXT DEFAULT 'Used',
  lot_size TEXT, location TEXT,
  description TEXT,
  features TEXT DEFAULT '[]',
  color TEXT DEFAULT '#1F6F5C',
  image_url TEXT,
  status TEXT DEFAULT 'available',
  sold_price REAL, sold_at TEXT,
  featured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  nights INTEGER NOT NULL,
  guests INTEGER DEFAULT 1,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  rig_info TEXT,
  addons TEXT DEFAULT '[]',
  base REAL DEFAULT 0,
  addons_total REAL DEFAULT 0,
  fees REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL DEFAULT 0,
  deposit REAL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid',
  status TEXT DEFAULT 'pending',
  notes TEXT,
  admin_notes TEXT,
  stripe_session TEXT,
  source TEXT DEFAULT 'web',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_item ON bookings(kind, item_id, start_date, end_date);
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER,
  kind TEXT DEFAULT 'info',
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
  message TEXT, offer_amount REAL, preferred_date TEXT,
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
  subject TEXT, message TEXT NOT NULL,
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT,
  quote TEXT NOT NULL,
  rating INTEGER DEFAULT 5,
  stay TEXT,
  email TEXT,
  booking_code TEXT,
  source TEXT DEFAULT 'admin',
  status TEXT DEFAULT 'pending',
  featured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
  topic TEXT, page TEXT,
  callback INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open',
  unread_staff INTEGER DEFAULT 0,
  unread_guest INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_messages ON chat_messages(chat_id, id);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS runtime (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS uploads (
  name TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT, recipient TEXT, subject TEXT,
  status TEXT, provider_id TEXT, error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  amount REAL NOT NULL,
  method TEXT,
  note TEXT,
  paid_on TEXT NOT NULL,
  recorded_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE TABLE IF NOT EXISTS blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_blocks_item ON blocks(kind, item_id, start_date, end_date);
`;

// ---------- passwords ----------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
export function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const real = Buffer.from(hash, 'hex');
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}

// ---------- settings ----------
export const DEFAULT_SETTINGS = {
  business_name: 'STAYCAMPRV LLC',
  tagline: 'RV rentals, campgrounds & RV sales across Florida, Arizona, Utah and Colorado',
  phone: '',
  email: 'bookings@staycamp.online',
  support_email: 'support@staycamp.online',
  notify_email: '',
  // Where the business operates. role: Headquarters | Location | Branch. City and phone are optional.
  locations: [
    { state: 'FL', role: 'Headquarters', city: 'Kissimmee', phone: '', blurb: 'Our main office near Orlando: RV rental pickup and returns, sales, and the STAYCAMPRV Resort.' },
    { state: 'AZ', role: 'Location', city: '', phone: '', blurb: 'Saguaro deserts, red rocks and the Grand Canyon. Ask us about RV rentals and campsites in Arizona.' },
    { state: 'UT', role: 'Location', city: '', phone: '', blurb: 'Canyon country and the Mighty 5 national parks. Ask us about RV rentals and campsites in Utah.' },
    { state: 'CO', role: 'Branch', city: '', phone: '', blurb: 'Rocky Mountain high country, alpine lakes and mountain towns. Ask our Colorado branch about your trip.' }
  ],
  seo_title: '',
  seo_description: '',
  google_site_verification: '',
  address: '1200 Sunrise Palm Way, Kissimmee, FL 34746',
  hours: 'Mon–Sat 8:00 AM – 6:00 PM · Sun 10:00 AM – 4:00 PM',
  tax_rate: 0.07,
  // Payment is collected by staff, not online. Shown in booking emails and on the guest's booking page.
  payment_instructions: 'We collect payment directly, not online. After we confirm your booking, our team will contact you with how to pay. The balance is due by pickup or check-in.',
  // Website requests that are still pending with no payment after this many days are cancelled, freeing the dates (0 = never).
  hold_days: 3,
  check_in_time: '3:00 PM',
  check_out_time: '11:00 AM',
  rv_pickup_time: '2:00 PM',
  rv_return_time: '11:00 AM',
  max_site_guests: 8,
  rv_addons: [
    { id: 'delivery', name: 'Delivery & setup (within 50 miles)', price: 195, per: 'stay' },
    { id: 'protection', name: 'Damage protection plan', price: 29, per: 'night' },
    { id: 'generator', name: 'Unlimited generator use', price: 15, per: 'night' },
    { id: 'kitchen', name: 'Kitchen & cookware kit', price: 85, per: 'stay' },
    { id: 'linens', name: 'Linens & towel pack', price: 60, per: 'stay' },
    { id: 'pets', name: 'Pet-friendly fee', price: 100, per: 'stay' }
  ],
  lot_addons: [
    { id: 'golfcart', name: 'Golf cart rental', price: 45, per: 'night' },
    { id: 'pets', name: 'Pet fee', price: 5, per: 'night' },
    { id: 'extra_vehicle', name: 'Extra vehicle parking', price: 8, per: 'night' },
    { id: 'early', name: 'Early check-in (11 AM)', price: 25, per: 'stay' }
  ],
  amenities: ['Resort-style pool', 'Lake access & kayak launch', 'Fenced dog park', 'Free high-speed Wi-Fi',
    'Laundry facility', 'Hot showers & restrooms', 'Dump station', 'Propane refills', 'Clubhouse & fire pits', 'Gated 24/7 access'],
  rental_policy: 'Renters must be 25+ with a valid driver\'s license and proof of insurance. A refundable security deposit is collected at pickup and returned within 7 days of inspection. Each rental includes the listed miles per night; additional miles are $0.45/mile. Fuel and propane must be returned at the pickup level. No smoking in any unit.',
  site_policy: 'Quiet hours are 10 PM – 7 AM. Two vehicles per site. Pets welcome on a leash and must be cleaned up after. Monthly stays are billed for metered electric at local utility rates. Rigs must be in good condition and self-contained.',
  cancellation_policy: 'Free cancellation up to 14 days before arrival. Cancellations 3–13 days before arrival receive a 50% refund. Cancellations within 72 hours of arrival are non-refundable. Weather-related closures are always fully refunded.',
  faq: [
    { q: 'Do I need a special license to drive a rented RV?', a: 'No. All of our motorhomes and towables can be driven with a valid driver\'s license from any U.S. state.' },
    { q: 'Can you deliver an RV to a campground for me?', a: 'Yes. Add "Delivery & setup" at checkout and we will tow or drive the unit to your site within 50 miles, level it, and hook it up.' },
    { q: 'Do your RV sites have full hookups?', a: 'Every site has water, sewer, and 30 or 50 amp electric. Sites in Section B are pull-through and fit rigs up to 70 feet.' },
    { q: 'Can I finance an RV or lot purchase?', a: 'Yes. We work with several lenders. Use the payment estimator on any listing and send a financing request — we will respond within one business day.' },
    { q: 'How do I change or cancel my booking?', a: 'Use "Manage Booking" with your confirmation code and email. You can cancel online, or call us to change dates.' }
  ],
  hero_title: 'Wake up somewhere beautiful.',
  hero_subtitle: 'Rent a road-ready RV, park at our lakeside RV resort, or find the rig — or lot — you\'ll call home.'
};

// Settings are loaded from the database at the start of each request (refreshSettings), so getSettings() stays synchronous.
let stored = [];
export async function refreshSettings() {
  stored = await db.prepare('SELECT key, value FROM settings').all();
}
export function getSettings() {
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const row of stored) {
    try { out[row.key] = JSON.parse(row.value); } catch { out[row.key] = row.value; }
  }
  return out;
}
export async function setSetting(key, value) {
  await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
  stored = [...stored.filter(r => r.key !== key), { key, value: JSON.stringify(value) }];
}

// ---------- seed ----------
function insert(table, obj) {
  const keys = Object.keys(obj);
  const vals = keys.map(k => (Array.isArray(obj[k]) ? JSON.stringify(obj[k]) : obj[k]));
  return db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...vals);
}

function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function seedInventory() {
  const rvs = [
    { name: 'Coral Breeze', type: 'Class A Motorhome', year: 2023, make: 'Thor Motor Coach', model: 'Hurricane 34J', sleeps: 8, length_ft: 35, nightly_rate: 289, weekly_rate: 1795, deposit: 1500, cleaning_fee: 175, miles_per_night: 150, min_nights: 3, color: '#F26B3A', featured: 1,
      description: 'Our flagship motorhome. Two slide-outs, a king bedroom suite, an outdoor TV and a full kitchen make the Coral Breeze the best way to tour the Keys or settle in at Fort Wilderness with the whole family.',
      features: ['King bed + bunks', 'Two slide-outs', 'Outdoor entertainment center', 'Ducted A/C', '5.5kW Onan generator', 'Backup camera', 'Full kitchen with oven', 'Power awning'] },
    { name: 'Palm Voyager', type: 'Class C Motorhome', year: 2022, make: 'Winnebago', model: 'Minnie Winnie 31K', sleeps: 6, length_ft: 31, nightly_rate: 219, weekly_rate: 1350, deposit: 1000, cleaning_fee: 150, miles_per_night: 125, min_nights: 2, color: '#1F6F5C', featured: 1,
      description: 'Easy to drive, easy to love. The Palm Voyager drives like a large van and has a cab-over bunk the kids will fight over, a rear queen bedroom, and a dinette that converts to a bed.',
      features: ['Rear queen bedroom', 'Cab-over bunk', 'Ford E-450 chassis', 'Generator', 'Outdoor shower', 'Bluetooth stereo', 'Backup camera'] },
    { name: 'Key West Nomad', type: 'Class B Camper Van', year: 2024, make: 'Winnebago', model: 'Travato 59K', sleeps: 2, length_ft: 21, nightly_rate: 199, weekly_rate: 1250, deposit: 1000, cleaning_fee: 125, miles_per_night: 175, min_nights: 2, color: '#2B7A9E', featured: 1,
      description: 'A nimble camper van for couples who want to go anywhere. Lithium power, solar panels and a wet bath mean you can stay off-grid for days, then fit in a normal parking space downtown.',
      features: ['Lithium battery + solar', 'Wet bath', 'Induction cooktop', 'Fits standard parking', 'Ram ProMaster chassis', 'Roof fan', 'Apple CarPlay'] },
    { name: 'Hibiscus Classic', type: 'Travel Trailer', year: 2022, make: 'Airstream', model: 'Flying Cloud 25FB', sleeps: 5, length_ft: 25, nightly_rate: 159, weekly_rate: 995, deposit: 750, cleaning_fee: 125, miles_per_night: 0, min_nights: 2, color: '#C2185B',
      description: 'An iconic aluminum Airstream with a front bedroom and rear bath. Tow it yourself (7,000 lb rated vehicle required) or add delivery and we will set it up at your campsite.',
      features: ['Iconic Airstream shell', 'Front queen bed', 'Rear full bath', 'Solar prep', 'Weight-distribution hitch included', 'Delivery available'] },
    { name: 'Everglades Estate', type: 'Fifth Wheel', year: 2023, make: 'Grand Design', model: 'Solitude 380FL', sleeps: 6, length_ft: 42, nightly_rate: 239, weekly_rate: 1495, deposit: 1500, cleaning_fee: 175, miles_per_night: 0, min_nights: 3, color: '#6D4C41',
      description: 'Residential luxury on wheels. A front living room with fireplace, theater seating, a residential fridge and a washer/dryer prep. Delivered and set up at the campground of your choice.',
      features: ['Front living room', 'Electric fireplace', 'Theater seating', 'Residential fridge', 'Kitchen island', 'Three A/C units', 'Delivered & set up'] },
    { name: 'Gulf Coast Toy Box', type: 'Toy Hauler', year: 2021, make: 'Keystone', model: 'Fuzion 373', sleeps: 8, length_ft: 40, nightly_rate: 229, weekly_rate: 1450, deposit: 1500, cleaning_fee: 175, miles_per_night: 0, min_nights: 3, color: '#F9A825',
      description: 'Bring the jet skis, dirt bikes or golf cart. A 13-foot garage converts to a patio deck with the ramp door, and drop-down beds turn it into a second bedroom at night.',
      features: ['13 ft garage', 'Ramp-door patio', 'Fuel station', 'Drop-down garage beds', 'Onan generator', 'Outdoor kitchen'] },
    { name: 'Orange Blossom', type: 'Class C Motorhome', year: 2023, make: 'Jayco', model: 'Greyhawk 29MV', sleeps: 8, length_ft: 30, nightly_rate: 209, weekly_rate: 1295, deposit: 1000, cleaning_fee: 150, miles_per_night: 125, min_nights: 2, color: '#FB8C00',
      description: 'A family-friendly Class C with a Murphy bed, cab-over bunk and a big slide-out. Great for theme-park weeks and spring training trips.',
      features: ['Murphy bed sofa', 'Cab-over bunk', 'Full-wall slide', 'Outdoor speakers', 'Generator', 'Power awning with LED'] },
    { name: 'Mangrove Mini', type: 'Travel Trailer', year: 2024, make: 'Jayco', model: 'Jay Feather Micro 166FBS', sleeps: 4, length_ft: 21, nightly_rate: 119, weekly_rate: 749, deposit: 500, cleaning_fee: 95, miles_per_night: 0, min_nights: 2, color: '#43A047',
      description: 'A lightweight trailer that most SUVs and half-ton trucks can tow. Perfect for a long weekend at a state park.',
      features: ['Tows with most SUVs', 'Queen bed', 'Dinette converts to bed', 'Full bathroom', 'Outdoor griddle', 'Delivery available'] }
  ];
  for (const r of rvs) await insert('rvs', r);

  const sections = [
    { section: 'A · Lakefront Premium', prefix: 'A', count: 6, site_type: 'Back-in', max_length: 45, amps: '30/50', nightly_rate: 89, weekly_rate: 549, monthly_rate: 1495, min_nights: 1,
      description: 'Lakefront sites with a concrete pad, paver patio, picnic table and fire ring. Watch the sunrise over the water from your door.', features: ['Lakefront view', 'Concrete pad', 'Paver patio', 'Fire ring', 'Picnic table'] },
    { section: 'B · Big Rig Pull-Through', prefix: 'B', count: 8, site_type: 'Pull-through', max_length: 70, amps: '50', nightly_rate: 75, weekly_rate: 465, monthly_rate: 1195, min_nights: 1,
      description: 'Extra-long pull-through sites. No backing up, room for your toad, and 50 amp service.', features: ['70 ft pull-through', 'Room for tow vehicle', 'Gravel pad', 'Picnic table'] },
    { section: 'C · Garden Standard', prefix: 'C', count: 8, site_type: 'Back-in', max_length: 40, amps: '30/50', nightly_rate: 59, weekly_rate: 365, monthly_rate: 895, min_nights: 1,
      description: 'Shaded back-in sites near the pool, clubhouse and dog park.', features: ['Shade trees', 'Steps to the pool', 'Gravel pad', 'Picnic table'] },
    { section: 'D · Extended Stay', prefix: 'D', count: 6, site_type: 'Back-in', max_length: 45, amps: '50', nightly_rate: 49, weekly_rate: 299, monthly_rate: 795, min_nights: 30,
      description: 'Monthly and seasonal sites for snowbirds and traveling professionals. Metered electric, mail service, and a 30-night minimum stay.', features: ['30-night minimum', 'Metered electric', 'Mail service', 'Storage shed allowed'] }
  ];
  const resortId = (await insert('campgrounds', { ...DEFAULT_CAMPGROUND, address: DEFAULT_SETTINGS.address, amenities: DEFAULT_SETTINGS.amenities })).lastInsertRowid;
  const keysId = (await insert('campgrounds', {
    name: 'STAYCAMPRV Keys Campground', location: 'Marathon, FL', address: 'Overseas Hwy, Marathon, FL 33050', sort_order: 2,
    description: 'A small, quiet campground in the Middle Keys with oceanfront and tropical garden pads, a boat ramp, and sunsets over Florida Bay.',
    amenities: ['Oceanfront pads', 'Boat ramp & dock', 'Bathhouse & laundry', 'Free Wi-Fi', 'Pet friendly', 'Fishing pier'],
    features: ['Middle Keys location', 'Snorkeling nearby', 'Sunset views over Florida Bay']
  })).lastInsertRowid;
  for (const s of sections) {
    for (let i = 1; i <= s.count; i++) {
      const { prefix, count, ...rest } = s;
      await insert('lots', { ...rest, campground_id: resortId, code: `${prefix}-${String(i).padStart(2, '0')}`, water: 1, sewer: 1, wifi: 1 });
    }
  }
  const keysSections = [
    { section: 'Oceanfront', prefix: 'O', count: 4, site_type: 'Back-in', max_length: 40, amps: '30/50', nightly_rate: 119, weekly_rate: 749, monthly_rate: 2195, min_nights: 2,
      description: 'Waterfront pads steps from the seawall, with a concrete pad, picnic table and an unobstructed view of the sunset.', features: ['Oceanfront', 'Concrete pad', 'Picnic table', 'Sunset view'] },
    { section: 'Tropical Garden', prefix: 'T', count: 4, site_type: 'Back-in', max_length: 35, amps: '30', nightly_rate: 79, weekly_rate: 495, monthly_rate: 1395, min_nights: 2,
      description: 'Shaded pads among palms and sea grape, a short walk to the bathhouse, dock and fishing pier.', features: ['Palm shade', 'Gravel pad', 'Near the dock', 'Picnic table'] }
  ];
  for (const s of keysSections) {
    for (let i = 1; i <= s.count; i++) {
      const { prefix, count, ...rest } = s;
      await insert('lots', { ...rest, campground_id: keysId, code: `${prefix}-${String(i).padStart(2, '0')}`, water: 1, sewer: 1, wifi: 1 });
    }
  }
  await db.prepare("UPDATE lots SET status = 'maintenance' WHERE code = 'C-08'").run();

  const sales = [
    { category: 'rv', title: '2019 Tiffin Allegro Red 33AA', type: 'Class A Motorhome', year: 2019, make: 'Tiffin', model: 'Allegro Red 33AA', length_ft: 34, mileage: 38500, sleeps: 6, price: 149900, condition: 'Used', color: '#B71C1C', featured: 1,
      description: 'One-owner diesel pusher with full service records. Two slides, a king bed and a 340 hp Cummins. Inspected by our service team.', features: ['340 hp Cummins diesel', 'Two slide-outs', 'King bed', 'Washer/dryer', 'Satellite dish', 'Service records'] },
    { category: 'rv', title: '2021 Forest River Sunseeker 3050S', type: 'Class C Motorhome', year: 2021, make: 'Forest River', model: 'Sunseeker 3050S', length_ft: 32, mileage: 22100, sleeps: 8, price: 89500, condition: 'Certified Pre-Owned', color: '#1565C0',
      description: 'A clean Class C with a rear corner bed, full-wall slide and a new set of tires. Comes with our 90-day powertrain warranty.', features: ['Full-wall slide', 'New tires', '90-day warranty', 'Generator', 'Backup camera'] },
    { category: 'rv', title: '2020 Airstream Classic 30RB', type: 'Travel Trailer', year: 2020, make: 'Airstream', model: 'Classic 30RB', length_ft: 30, sleeps: 5, price: 112000, condition: 'Used', color: '#78909C', featured: 1,
      description: 'The top-of-the-line Airstream. Rear bedroom with twin or queen option, solar, and Airstream\'s Smart Control system. Kept under cover.', features: ['Solar package', 'Smart Control', 'Rear bedroom', 'Kept under cover'] },
    { category: 'rv', title: '2025 Grand Design Imagine 2800BH', type: 'Travel Trailer', year: 2025, make: 'Grand Design', model: 'Imagine 2800BH', length_ft: 33, sleeps: 10, price: 46995, condition: 'New', color: '#00897B',
      description: 'A brand-new bunkhouse built for big families, with a double-over-double bunk room and an outdoor kitchen.', features: ['Bunkhouse', 'Outdoor kitchen', 'Solar prep', 'Manufacturer warranty'] },
    { category: 'lot', title: 'Deeded Lakefront RV Lot W-12', type: 'Deeded RV Lot', lot_size: '0.18 acre (60 × 130 ft)', location: 'STAYCAMPRV Shores · Lakefront Row', price: 119000, condition: 'Deeded', featured: 1,
      description: 'Own your piece of Florida. This lakefront lot has a 60 ft concrete pad, a 12×16 screened casita pad, full 50 amp hookups and a private dock share. HOA includes lawn care, pool and security.', features: ['Lakefront', '60 ft concrete pad', 'Casita pad', '50 amp full hookup', 'Dock share', 'HOA $145/mo'] },
    { category: 'lot', title: 'Corner RV Lot L-7 with Casita Pad', type: 'Deeded RV Lot', lot_size: '0.22 acre (75 × 128 ft)', location: 'STAYCAMPRV Shores · Palm Loop', price: 84500, condition: 'Deeded',
      description: 'A roomy corner lot with mature palms and space for a casita, a carport and a golf cart. Steps from the clubhouse and pool.', features: ['Corner lot', 'Mature palms', 'Carport allowed', 'Near clubhouse', 'HOA $145/mo'] },
    { category: 'lot', title: 'Interior RV Lot L-15', type: 'Deeded RV Lot', lot_size: '0.15 acre (55 × 120 ft)', location: 'STAYCAMPRV Shores · Hibiscus Lane', price: 62000, condition: 'Deeded',
      description: 'An affordable deeded lot with full hookups and a gravel pad ready for your rig. Rent it out through our rental program when you are not there.', features: ['Full hookups', 'Rental program eligible', 'Gravel pad', 'HOA $145/mo'] }
  ];
  for (const x of sales) await insert('sales', x);
}

async function seedDemoBookings() {
  const rvIds = await db.prepare('SELECT id, nightly_rate, cleaning_fee, deposit FROM rvs').all();
  const lotIds = await db.prepare("SELECT id, nightly_rate FROM lots WHERE status='active'").all();
  const make = (kind, item, startOff, nights, status, idx) => {
    const start = localDate(startOff), end = localDate(startOff + nights);
    const base = item.nightly_rate * nights;
    const fees = kind === 'rv' ? item.cleaning_fee : 0;
    const tax = Math.round((base + fees) * 0.07 * 100) / 100;
    const total = Math.round((base + fees + tax) * 100) / 100;
    const paid = status === 'completed' || status === 'checked_in' || status === 'confirmed';
    return insert('bookings', {
      code: 'SC-DEMO' + String(idx).padStart(2, '0'), kind, item_id: item.id, start_date: start, end_date: end, nights,
      guests: 2, customer_name: `Sample Guest ${idx}`, customer_email: `guest${idx}@example.com`, customer_phone: '(555) 010-' + String(1000 + idx),
      base, fees, tax, total, deposit: kind === 'rv' ? item.deposit : 0, amount_paid: paid ? total : 0,
      payment_status: paid ? 'paid' : 'unpaid', status, admin_notes: 'Demo booking — remove with "npm run reset:clean".', source: 'demo'
    });
  };
  let i = 1;
  await make('rv', rvIds[0], -150, 7, 'completed', i++);
  await make('rv', rvIds[1], -120, 5, 'completed', i++);
  await make('lot', lotIds[0], -100, 14, 'completed', i++);
  await make('rv', rvIds[2], -75, 4, 'completed', i++);
  await make('lot', lotIds[9], -60, 30, 'completed', i++);
  await make('rv', rvIds[4], -40, 6, 'completed', i++);
  await make('lot', lotIds[3], -20, 10, 'completed', i++);
  await make('rv', rvIds[0], -2, 5, 'checked_in', i++);
  await make('lot', lotIds[1], -1, 4, 'checked_in', i++);
  await make('lot', lotIds[8], 2, 3, 'confirmed', i++);
  await make('rv', rvIds[1], 5, 4, 'confirmed', i++);
  await make('rv', rvIds[6], 12, 7, 'pending', i++);
  await make('lot', lotIds[4], 9, 7, 'pending', i++);
  await insert('inquiries', { listing_id: 5, kind: 'tour', name: 'Sample Buyer', email: 'buyer@example.com', phone: '(555) 010-2000', message: 'Could we tour the lakefront lot this weekend?', preferred_date: localDate(4) });
  await insert('messages', { name: 'Sample Visitor', email: 'visitor@example.com', subject: 'Group booking', message: 'Do you offer discounts for 5+ sites booked together for a rally?' });
}

// ---------- migration: campgrounds ----------
// Older databases had one resort with globally unique site codes. Move those sites into a default campground
// and allow the same site code in different campgrounds. Bookings keep pointing at the same site ids.
const DEFAULT_CAMPGROUND = {
  name: 'STAYCAMPRV Resort', location: 'Kissimmee, FL', featured: 1, sort_order: 1,
  description: 'Our gated lakeside resort minutes from Orlando, with full-hookup lakefront, pull-through and extended-stay sites, a resort pool, and quiet nights by the water.',
  features: ['Gated 24/7 access', 'On Sunrise Lake', '15 minutes to Orlando theme parks']
};
async function migrateCampgrounds() {
  const cols = (await db.prepare('PRAGMA table_info(lots)').all()).map(c => c.name);
  if (cols.includes('campground_id')) return;
  const st = getSettings();
  const r = await insert('campgrounds', { ...DEFAULT_CAMPGROUND, address: st.address, amenities: st.amenities || [] });
  const keep = cols.filter(c => c !== 'id');
  await client.batch([
    `CREATE TABLE lots_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campground_id INTEGER REFERENCES campgrounds(id),
  code TEXT NOT NULL,
${LOTS_COLS_SQL}`,
    { sql: `INSERT INTO lots_new (id, campground_id, ${keep.join(', ')}) SELECT id, ?, ${keep.join(', ')} FROM lots`, args: [r.lastInsertRowid] },
    'DROP TABLE lots',
    'ALTER TABLE lots_new RENAME TO lots'
  ], 'write');
  console.log('Migrated RV sites into the "STAYCAMPRV Resort" campground.');
}
const LOTS_COLS_SQL = `  section TEXT NOT NULL,
  site_type TEXT DEFAULT 'Back-in',
  max_length INTEGER DEFAULT 40,
  amps TEXT DEFAULT '30/50',
  water INTEGER DEFAULT 1,
  sewer INTEGER DEFAULT 1,
  wifi INTEGER DEFAULT 1,
  nightly_rate REAL NOT NULL,
  weekly_rate REAL,
  monthly_rate REAL,
  min_nights INTEGER DEFAULT 1,
  description TEXT,
  features TEXT DEFAULT '[]',
  image_url TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (campground_id, code)
);`;
const hasColumn = async (table, col) => (await db.prepare(`PRAGMA table_info(${table})`).all()).some(c => c.name === col);

// Creates tables and applies migrations. Safe to run on every start.
export async function initSchema() {
  await db.exec(SCHEMA);
  await refreshSettings();
  await migrateCampgrounds();
  if (!await hasColumn('rvs', 'pickup_location')) await db.exec('ALTER TABLE rvs ADD COLUMN pickup_location TEXT');
  // Chat state that used to live in server memory, which serverless functions don't keep between requests.
  if (!await hasColumn('chats', 'guest_seen_at')) {
    await db.exec(`ALTER TABLE chats ADD COLUMN guest_seen_at INTEGER DEFAULT 0;
      ALTER TABLE chats ADD COLUMN emailed_up_to INTEGER DEFAULT 0;`);
    await markChatRepliesEmailed();
  }
  if (!await hasColumn('bookings', 'hold_warned_at')) await db.exec('ALTER TABLE bookings ADD COLUMN hold_warned_at TEXT');
  // Link a listing was imported from (staff only; used to spot duplicate imports).
  for (const t of ['rvs', 'lots', 'sales']) if (!await hasColumn(t, 'source_url')) await db.exec(`ALTER TABLE ${t} ADD COLUMN source_url TEXT`);
  // Payments recorded before the payment history existed become one entry each, so totals keep adding up.
  await db.exec(`INSERT INTO payments (booking_id, amount, method, note, paid_on)
    SELECT id, amount_paid, 'Other', 'Recorded before payment history', substr(created_at, 1, 10) FROM bookings b
    WHERE amount_paid > 0 AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id)`);
}
// Treat every staff reply already on record as handled, so the chat email check never resends old replies.
export const markChatRepliesEmailed = () => db.exec(`UPDATE chats SET emailed_up_to =
  COALESCE((SELECT MAX(id) FROM chat_messages m WHERE m.chat_id = chats.id AND m.sender = 'staff'), 0)`);

export async function seedIfEmpty({ demo = process.env.SEED_DEMO !== '0' } = {}) {
  const { c } = await db.prepare('SELECT COUNT(*) AS c FROM rvs').get();
  if (c === 0) {
    await seedInventory();
    if (demo) await seedDemoBookings();
    console.log(`Seeded inventory${demo ? ' and demo bookings' : ''}.`);
  }
  const { u } = await db.prepare('SELECT COUNT(*) AS u FROM users').get();
  if (u === 0) {
    const email = (process.env.ADMIN_EMAIL || 'admin@staycamp.online').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'StayCamp2026!';
    await db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run(email, 'Administrator', hashPassword(password));
    console.log(`Created admin account: ${email} / ${process.env.ADMIN_PASSWORD ? '(from ADMIN_PASSWORD)' : password}  — change it in Admin → Settings.`);
  }
}
