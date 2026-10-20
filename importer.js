// Listing importer: turns a listing page (or text pasted from one) into a filled-in draft for the admin's add form.
// Staff always review the draft before saving, so nothing imported goes live on its own.
//   RV n' GO (rvngo.com)       → RV Fleet       (rental listings)
//   RVProperty (rvproperty.com) → RV Sites / Pads (sites for rent) or Sales Listings (lots for sale)
//   Any other page              → read from its standard share tags and structured data
//   Pasted text                 → for sites that block automatic access, such as RVezy
// Seller contact details are never imported.
import dns from 'node:dns/promises';
import net from 'node:net';
import crypto from 'node:crypto';
import { parse } from 'node-html-parser';
import { db } from './db.js';
import './public/js/regions.js';

const R = globalThis.RFRegions;
export class ImportError extends Error { constructor(message) { super(message); this.name = 'ImportError'; } }

// ---------- fetching (public web pages only) ----------
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
// Never fetch addresses inside a private network (protects the server from being used to reach internal services).
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}
async function safeFetch(url, { maxBytes, accept = 'text/html,*/*' }) {
  for (let hop = 0; hop < 5; hop++) {
    let u;
    try { u = new URL(url); } catch { throw new ImportError('That doesn’t look like a web link.'); }
    if (!['http:', 'https:'].includes(u.protocol) || (u.port && !['80', '443'].includes(u.port))) throw new ImportError('Only normal web links (https://…) can be imported.');
    const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => []);
    if (!addrs.length) throw new ImportError(`Couldn’t find the website ${u.hostname}.`);
    if (addrs.some(a => privateIp(a.address))) throw new ImportError('That address can’t be imported.');
    let res;
    try {
      res = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': BROWSER_UA, Accept: accept, 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(12000) });
    } catch { throw new ImportError(`Couldn’t reach ${u.hostname}. Check the link and try again.`); }
    const next = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && next) { url = new URL(next, u).href; continue; }
    if (res.headers.get('cf-mitigated') || ([403, 429, 503].includes(res.status) && /cloudflare/i.test(res.headers.get('server') || '')))
      throw new ImportError(`${u.hostname.replace(/^www\./, '')} blocks automatic imports. Open the listing in your browser, select all the text (Ctrl+A, then Ctrl+C) and use “Paste text” instead.`);
    if (!res.ok) throw new ImportError(`${u.hostname.replace(/^www\./, '')} answered with an error (${res.status}). Check that the listing is still online.`);
    const chunks = []; let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > maxBytes) throw new ImportError('That page or photo is too large to import.');
      chunks.push(chunk);
    }
    return { buf: Buffer.concat(chunks), type: res.headers.get('content-type') || '', url: u.href };
  }
  throw new ImportError('That link redirects too many times.');
}

// ---------- text helpers ----------
const clean = s => String(s ?? '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
const SMALL = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
// Ad titles are often typed in capitals ("BEAUTIFUL EAST FACING LOT"); turn those into Title Case. Model codes like 30T stay.
function tidyTitle(s) {
  s = clean(s).replace(/\s*[|–-]\s*(RV Property|RVnGO|RVezy)\s*$/i, '');
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (!letters || letters.replace(/[^A-Z]/g, '').length / letters.length < 0.7) return s;
  return s.toLowerCase().split(' ').map((w, i) => /\d/.test(w) ? w.toUpperCase()
    : i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
const sentenceCase = s => { s = clean(s).replace(/[.;,]+$/, ''); return s.charAt(0).toUpperCase() + s.slice(1); };
const num = s => { const m = String(s ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };
// Phone numbers, email addresses and "text me / call me" lines belong to the original seller, so they're dropped.
const CONTACT = /https?:\/\/\S+|\bwww\.\S+|\b[\w.+-]+@[\w-]+\.[\w.]+\b|\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\b(text|call|email|e-mail|contact|message|reach)\s+(me|us|todd|the owner|owner)\b|\bplease (text|call|email|e-mail|contact|reach out)\b|\b(email|call|text) or (call|text|email)\b/i;
// HTML → plain text that keeps paragraphs, line breaks and list items.
function htmlText(html) {
  const marked = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|li|ul|ol|h\d|tr|section)>/gi, '\n\n');
  return parse(marked).text.split('\n').map(clean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
// Splits free text into description paragraphs and a features list (lines written as "- item" or "• item").
function splitText(text, { proseOnly = false } = {}) {
  const features = [], paras = [];
  let para = [];
  const flush = () => { if (para.length) { paras.push(para.join(' ')); para = []; } };
  for (const raw of String(text || '').split('\n')) {
    const line = clean(raw.replace(/[*_]{2,}/g, ''));
    if (!line) { flush(); continue; }
    const bullet = line.match(/^(?:[-•*–·✓✔]|\d+[.)])\s+(.+)/);
    if (bullet) { flush(); if (!CONTACT.test(bullet[1])) features.push(sentenceCase(bullet[1]).slice(0, 120)); continue; }
    if (/^-{2,}.*-{2,}$/.test(line) || /^[A-Za-z][A-Za-z &'/-]{1,30}:$/.test(line)) { flush(); continue; }   // headings: "--- Layout ---", "Features:"
    // Copied page text is full of short labels and buttons; there, only real sentences count as description.
    if (proseOnly && (line.length < 40 || !/[.!?)]$/.test(line))) { flush(); continue; }
    para.push(line);
  }
  flush();
  // Drop contact sentences from the prose too.
  const description = paras
    .map(p => p.split(/(?<=[.!?])\s+/).filter(sn => !CONTACT.test(sn)).join(' ').trim())
    .filter(p => p && !/^no smoking\.?$/i.test(p)).join('\n\n');
  return { description: description.slice(0, 5000), features: [...new Set(features)].slice(0, 16) };
}
const STATE_CODES = Object.fromEntries(Object.entries(R.STATES).map(([code, name]) => [name.toLowerCase(), code]));
// "10173 N Suncoast Blvd, Crystal River, FL 34428, USA" → "Crystal River, FL" (the street address is the seller's).
function cityState(address, stateName) {
  const parts = clean(address).split(',').map(clean).filter(Boolean);
  const i = parts.findIndex(p => /^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/.test(p) && R.STATES[p.slice(0, 2)]);
  if (i > 0) return `${parts[i - 1]}, ${parts[i].slice(0, 2)}`;
  const code = STATE_CODES[clean(stateName).toLowerCase()];
  return code ? R.STATES[code] : clean(stateName);
}
const RV_TYPES = [[/toy\s*hauler/i, 'Toy Hauler'], [/fifth|5th[\s-]*wheel/i, 'Fifth Wheel'], [/pop[\s-]*up|tent\s*trailer|folding/i, 'Pop-up Camper'],
  [/class\s*b\b|camper\s*van|\bvan\b/i, 'Class B Camper Van'], [/class\s*c\b|super\s*c\b/i, 'Class C Motorhome'], [/class\s*a\b|diesel\s*pusher|motor\s*coach|\bbus\b/i, 'Class A Motorhome'],
  [/travel\s*trailer|teardrop|\btrailer\b|airstream/i, 'Travel Trailer']];
const rvType = s => RV_TYPES.find(([re]) => re.test(s))?.[1] || null;
const towable = type => /trailer|fifth|toy|pop-up/i.test(type || '');

// ---------- site readers: page → raw facts ----------
function readRvProperty(root) {
  const icons = Object.fromEntries(root.querySelectorAll('.single-icons li').map(li => [li.getAttribute('class') || '', clean(li.text)]));
  const body = root.querySelector('#single-ad-content .one_half.first');
  return {
    source: 'RVProperty',
    title: root.querySelector('h1')?.text,
    text: htmlText(body?.innerHTML),
    photos: root.querySelectorAll('.lightgallery__item').map(el => el.getAttribute('data-src')).filter(Boolean),
    priceText: clean(root.querySelector('#single-ad-content .price')?.text),
    location: cityState(root.querySelector('#single-ad-content .loc')?.text, icons.state),
    category: icons.featured || '',
    specs: {}
  };
}
function readRvngo(root) {
  const specs = {};
  for (const item of root.querySelectorAll('.spec-item')) {
    const k = clean(item.querySelector('.spec-label')?.text), v = clean(item.querySelector('.spec-value')?.text);
    if (k) specs[k.toLowerCase()] = v;
  }
  for (const row of root.querySelectorAll('.rv-rules li, .rv-rules .rule-item, .rv-rules tr')) {
    const m = clean(row.text).match(/^(Minimum Stay|Maximum Stay|Check-in Time|Check-out Time)\s+(.+)$/i);
    if (m) specs[m[1].toLowerCase()] = m[2];
  }
  const rules = clean(root.querySelector('#rentalRulesSection')?.text);
  const min = rules.match(/Minimum Stay\s+(\d+)\s*night/i);
  if (min) specs['minimum stay'] = min[1];
  const map = root.querySelector('.rv-pickup-map');
  const gallery = root.querySelectorAll('#rvGalleryCarousel .carousel-item img').map(img => img.getAttribute('src'));
  return {
    source: 'RV n’ GO',
    title: root.querySelector('meta[property="og:title"]')?.getAttribute('content')?.replace(/\s+Rental in .*$/i, '') || root.querySelector('h1')?.text,
    text: htmlText(root.querySelector('.rv-description')?.innerHTML),
    amenities: root.querySelectorAll('.amenity-item').map(el => clean(el.text)).filter(Boolean),
    photos: gallery.filter(Boolean).map(src => src.replace(/image_\d+$/, 'image_1920')),
    priceText: clean(root.querySelector('#bookingCard .h4')?.text),
    location: map ? `${map.getAttribute('data-city')}, ${map.getAttribute('data-state')}` : '',
    category: specs['rv type'] || '',
    specs
  };
}
// Any other page: schema.org data first, then share tags, then the page's main text.
function readGeneric(root) {
  const ld = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try { const j = JSON.parse(s.text); ld.push(...[].concat(j, j['@graph'] || [])); } catch {}
  }
  const item = ld.find(x => /Product|Vehicle|Car|Offer|RealEstateListing|Accommodation|Place|Residence/i.test([].concat(x?.['@type'] || []).join(' '))) || {};
  const meta = k => root.querySelector(`meta[property="${k}"], meta[name="${k}"]`)?.getAttribute('content');
  const offer = [].concat(item.offers || [])[0] || {};
  const addr = item.address || item.location?.address || {};
  const images = [].concat(item.image || []).map(i => typeof i === 'string' ? i : i?.url).filter(Boolean);
  root.querySelectorAll('script,style,noscript,svg,header,footer,nav,form').forEach(n => n.remove());
  const main = root.querySelector('main, article, [role=main]');
  return {
    source: null,
    title: item.name || meta('og:title') || root.querySelector('h1')?.text || root.querySelector('title')?.text,
    text: item.description || meta('og:description') || meta('description') || (main ? htmlText(main.innerHTML).slice(0, 4000) : ''),
    photos: [...images, meta('og:image')].filter(Boolean),
    priceText: offer.price != null ? `$${offer.price}` : '',
    location: [addr.addressLocality, addr.addressRegion].filter(Boolean).join(', '),
    category: [].concat(item['@type'] || []).join(' '),
    specs: {}
  };
}
// Text copied from a listing page: first meaningful line is the title, "Label: value" lines become specs.
function readPasted(text) {
  const lines = String(text).split(/\r?\n/).map(clean);
  const specs = {};
  for (const l of lines) { const m = l.match(/^([A-Za-z][A-Za-z /&'-]{1,30})\s*[:|]\s*(.{1,80})$/); if (m) specs[m[1].toLowerCase()] = m[2]; }
  const title = lines.find(l => /\b(19[5-9]\d|20[0-4]\d)\b/.test(l) && l.length < 90) || lines.find(l => l.length > 3 && l.length < 90) || '';
  const price = lines.join(' ').match(/\$\s?[\d,]+(?:\.\d{2})?\s*(?:\/|per\s+)\s*(?:night|day)/i)?.[0] || '';
  const loc = lines.join('\n').match(/\b([A-Z][a-zA-Z .'-]{2,30}),\s*([A-Z]{2})\b/);
  return { source: null, pasted: true, title, text: lines.filter(l => l !== title).join('\n'), photos: [], priceText: price, location: loc ? `${loc[1]}, ${loc[2]}` : '', category: '', specs };
}

// ---------- facts → draft records ----------
// Rates written like "$75/night", "$450 per week", "$1,200 a month".
function rates(text) {
  const out = {};
  for (const m of String(text).matchAll(/\$\s?([\d,]+(?:\.\d{2})?)\s*(?:\/|per\s+|a\s+)\s*(night|nt|day|week|wk|month|mo)\b/gi)) {
    const unit = /^(night|nt|day)$/i.test(m[2]) ? 'nightly' : /^w/i.test(m[2]) ? 'weekly' : 'monthly';
    out[unit] ??= num(m[1]);
  }
  for (const m of String(text).replace(/[*_]{2,}/g, '').matchAll(/\b(nightly|daily|weekly|monthly)\s*(?:rate|rent|price)?\s*:?\s*\$\s?([\d,]+(?:\.\d{2})?)/gi)) {
    const unit = /^(nightly|daily)$/i.test(m[1]) ? 'nightly' : /^w/i.test(m[1]) ? 'weekly' : 'monthly';
    out[unit] ??= num(m[2]);
  }
  return out;
}
const yearMakeModel = title => {
  const m = clean(title).match(/\b(19[5-9]\d|20[0-4]\d)\s+([A-Za-z][\w&'-]*(?:\s+(?:River|Rambler|Design|Rv|Coach|Motor|Wood|Lake|Hill))?)\s+([^|,–]+)/i);
  return m ? { year: Number(m[1]), make: tidyTitle(m[2]), model: tidyTitle(m[3]).replace(/\s+(Class [ABC]|Motorhome|Travel Trailer|Fifth Wheel|Rental).*$/i, '').trim() } : {};
};

function toRv(f, notes) {
  const split = t => splitText(t, { proseOnly: f.pasted });
  const all = `${f.title}\n${f.category}\n${f.text}\n${Object.entries(f.specs).map(([k, v]) => `${k}: ${v}`).join('\n')}`;
  const { description, features } = split(f.text);
  const ymm = yearMakeModel(f.title);
  const type = rvType(f.specs['rv type'] || f.category) || rvType(all);
  if (!type) notes.push('Couldn’t tell the RV type. Please choose it.');
  const r = rates(`${f.priceText} ${f.text}`);
  const nightly = r.nightly || (/night|day/i.test(f.priceText) ? num(f.priceText) : null);
  if (!nightly) notes.push('No nightly price was shown on the listing. Enter your nightly rate.');
  const sleeps = num(f.specs.sleeps) || num(all.match(/sleeps\s*(?:up to\s*)?(\d{1,2})/i)?.[1]);
  if (!sleeps) notes.push('Sleeping capacity wasn’t found. Please enter it.');
  const len = num(f.specs.length) || num(all.match(/\b(\d{2}(?:\.\d)?)\s*(?:ft|foot|feet|′|')(?!\s*(?:x|×|by|wide))/i)?.[1]);
  const deposit = num(all.match(/(?:security\s+)?deposit[^$\n]{0,20}\$\s?([\d,]+)/i)?.[1]);
  const cleaning = num(all.match(/cleaning(?:\s+fee)?[^$\n]{0,20}\$\s?([\d,]+)/i)?.[1]);
  const slides = num(f.specs['slide outs']);
  const extra = [slides ? `${slides} slide-out${slides > 1 ? 's' : ''}` : '', ...(f.amenities || [])].filter(Boolean);
  return {
    name: tidyTitle(f.title).slice(0, 120),
    type: type || 'Class C Motorhome',
    year: num(f.specs.year) || ymm.year || null,
    make: tidyTitle(f.specs.make || ymm.make || ''),
    model: tidyTitle(f.specs.model || ymm.model || ''),
    sleeps: sleeps || null,
    length_ft: len && len >= 10 && len <= 60 ? Math.round(len) : null,
    nightly_rate: nightly || null,
    weekly_rate: r.weekly || null,
    deposit: deposit || null,
    cleaning_fee: cleaning || null,
    pickup_location: f.location || '',
    miles_per_night: towable(type) ? 0 : 100,
    min_nights: num(f.specs['minimum stay']) || num(all.match(/(\d+)[\s-]*night\s*minimum|minimum\s*(?:of\s*)?(\d+)\s*nights?/i)?.slice(1).find(Boolean)) || 2,
    status: 'active',
    description,
    features: [...new Set([...extra, ...features])].slice(0, 16)
  };
}

function toLot(f, notes) {
  const split = t => splitText(t, { proseOnly: f.pasted });
  const all = `${f.title}\n${f.category}\n${f.text}`.replace(/[*_]{2,}/g, '');
  const { description, features } = split(f.text);
  const r = rates(`${f.priceText} ${f.text}`);
  // A bare price ("$650") on a rental ad is usually monthly when the ad talks about months or seasons.
  const bare = !Object.keys(r).length && num(f.priceText);
  if (bare) { if (/month|season|annual|year|lease/i.test(all)) r.monthly = bare; else if (/week/i.test(all)) r.weekly = bare; else r.nightly = bare; }
  if (/for sale/i.test(f.category) && !/rent/i.test(f.category)) notes.push('This ad looks like a lot for sale, not a site for rent. Sales Listings may be the better place for it.');
  if (!r.nightly) notes.push(r.monthly || r.weekly ? 'Only a weekly or monthly rate was shown. Enter a nightly rate too.' : 'No rate was shown. Enter your nightly rate.');
  const full = /full[\s-]*hook[\s-]*ups?/i.test(all);
  const has50 = /\b50(?:\s*|-)amp|\b50\b.{0,6}?amp/i.test(all), has30 = /\b30(?:\s*|-)amp|\b30\b.{0,14}?amp/i.test(all);
  const maxLen = num(all.match(/(?:up to|max(?:imum)?|fits?)\s*(\d{2,3})\s*(?:ft|foot|feet|′|')/i)?.[1]) || num(all.match(/\b(\d{2,3})\s*(?:ft|foot|feet|′|')\s*(?:rig|rv|motorhome|coach)/i)?.[1]);
  const minM = all.match(/(\d+)[\s-]*(day|night|month)s?\s*min(?:imum)?|min(?:imum)?\s*(?:stay\s*(?:of\s*)?)?(\d+)\s*(day|night|month)/i);
  const minN = minM ? (num(minM[1] || minM[3]) * (/month/i.test(minM[2] || minM[4]) ? 30 : 1)) : (r.monthly && !r.nightly ? 30 : 1);
  const extras = [full && 'Full hookups', /wi-?fi|internet/i.test(all) && 'Wi-Fi', /concrete\s*pad/i.test(all) && 'Concrete pad', /patio/i.test(all) && 'Patio',
    /pool/i.test(all) && 'Pool access', /pet/i.test(all) && 'Pet friendly', /laundry/i.test(all) && 'Laundry', /gated/i.test(all) && 'Gated community'].filter(Boolean);
  notes.push('Choose the campground and enter a site number before saving.');
  return {
    code: '', section: /season/i.test(all) ? 'Seasonal' : /month|long[\s-]*term|extended/i.test(all) ? 'Extended Stay' : 'Standard',
    site_type: /pull[\s-]*thr(?:ough|u)/i.test(all) ? 'Pull-through' : 'Back-in',
    max_length: maxLen && maxLen >= 15 && maxLen <= 100 ? maxLen : 40,
    amps: has50 && has30 ? '30/50' : has50 ? '50' : has30 ? '30' : '30/50',
    water: full || /water/i.test(all) ? 1 : 0, sewer: full || /sewer/i.test(all) ? 1 : 0, wifi: /wi-?fi|internet/i.test(all) ? 1 : 0,
    nightly_rate: r.nightly || null, weekly_rate: r.weekly || null, monthly_rate: r.monthly || null, min_nights: minN || 1,
    status: 'active', description, features: [...new Set([...extras, ...features])].slice(0, 16)
  };
}

function toSale(f, notes) {
  const split = t => splitText(t, { proseOnly: f.pasted });
  const all = `${f.title}\n${f.category}\n${f.text}`;
  const { description, features } = split(f.text);
  const isRv = /\b(rv|motorhome|trailer|fifth|5th|camper|coach|van|toy hauler)s?\b/i.test(f.category) && !/\blots?\b|land|propert|membership|park model|home/i.test(f.category);
  const ymm = isRv ? yearMakeModel(f.title) : {};
  const price = /month|\/mo\b|per\s+(?:night|week)/i.test(f.priceText) ? null : num(f.priceText);
  if (!price) notes.push(/month|night|week/i.test(f.priceText) ? 'The listed price is a rent, not a sale price. Enter the asking price.' : 'No asking price was shown. Enter it before saving.');
  const acres = all.match(/(\d+(?:\.\d+)?)\s*\+?\s*acres?\b/i);
  const dims = all.match(/(\d{2,3})\s*(?:feet|ft|′|')?\s*(?:wide\s*)?(?:x|×|by)\s*(\d{2,3})\s*(?:feet|ft|′|')?/i);
  const lotType = /membership/i.test(all) ? 'Campground Membership' : /park\s*model/i.test(all) ? 'Park Model & Lot' : /rv\s*park|campground/i.test(f.category) ? 'RV Park / Campground'
    : /\bhome|house|barndominium/i.test(f.category + f.title) ? 'Home with RV Parking' : /deeded/i.test(all) ? 'Deeded RV Lot' : 'RV Lot';
  const condition = isRv ? (ymm.year >= new Date().getFullYear() ? 'New' : 'Used') : /deeded|owned land|fee simple/i.test(all) ? 'Deeded' : /\b(lease|leasehold|leased|membership|rent|rental)\b/i.test(all) ? 'Leasehold' : 'Deeded';
  if (isRv && !rvType(all)) notes.push('Couldn’t tell the RV type. Please enter it.');
  if (!isRv) notes.push(`Type “${lotType}” and condition “${condition}” are best guesses. Please check them.`);
  return {
    category: isRv ? 'rv' : 'lot',
    title: tidyTitle(f.title).slice(0, 140),
    type: isRv ? (rvType(all) || '') : lotType,
    price, condition, status: 'available',
    year: ymm.year || null, make: ymm.make || '', model: ymm.model || '',
    mileage: isRv ? num(all.match(/([\d,]{1,7})\s*(?:miles|mi)\b/i)?.[1]) : null,
    sleeps: num(all.match(/sleeps\s*(?:up to\s*)?(\d{1,2})/i)?.[1]),
    length_ft: isRv ? num(all.match(/\b(\d{2})\s*(?:ft|foot|feet|′|')(?!\s*(?:x|×|by|wide))/i)?.[1]) : null,
    lot_size: isRv ? '' : acres ? `${acres[1]} acre${acres[1] === '1' ? '' : 's'}` : dims ? `${dims[1]} × ${dims[2]} ft` : '',
    location: f.location || '',
    description, features
  };
}

// ---------- photos ----------
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
// Copies the first photo that downloads into our own photo storage, so the listing never depends on the other site.
async function savePhoto(urls) {
  for (const url of urls.slice(0, 3)) {
    try {
      const img = await safeFetch(url, { maxBytes: 4 * 1024 * 1024, accept: 'image/*' });
      const type = img.type.split(';')[0].trim().toLowerCase();
      if (!IMAGE_TYPES[type] || img.buf.length < 2000) continue;
      const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${IMAGE_TYPES[type]}`;
      await db.prepare('INSERT INTO uploads (name, type, data) VALUES (?, ?, ?)').run(name, type, img.buf);
      return `/uploads/${name}`;
    } catch {}
  }
  return null;
}

// ---------- entry point ----------
const TARGETS = { rvs: toRv, lots: toLot, sales: toSale };
const TABLES = { rvs: 'rvs', lots: 'lots', sales: 'sales' };
export async function importListing({ target, url = '', text = '', photoUrl = '' }) {
  if (!TARGETS[target]) throw new ImportError('Choose where to import the listing.');
  let facts, sourceUrl = '';
  if (url) {
    const page = await safeFetch(url, { maxBytes: 3 * 1024 * 1024 });
    if (!/html/i.test(page.type)) throw new ImportError('That link isn’t a web page.');
    const host = new URL(page.url).hostname.replace(/^www\./, '');
    const root = parse(page.buf.toString('utf8'));
    facts = host === 'rvproperty.com' ? readRvProperty(root) : host === 'rvngo.com' ? readRvngo(root) : readGeneric(root);
    sourceUrl = page.url;
    if (host === 'rvproperty.com' && target === 'rvs') throw new ImportError('RVProperty ads are lots and sites. Import them under RV Sites / Pads or Sales Listings.');
    if (host === 'rvngo.com' && target !== 'rvs') throw new ImportError('RV n’ GO listings are RV rentals. Import them under RV Fleet.');
  } else if (clean(text).length > 20) {
    facts = readPasted(text);
  } else {
    throw new ImportError('Paste a listing link, or the listing’s text.');
  }
  if (!clean(facts.title)) throw new ImportError('Couldn’t find a listing on that page. Check that the link opens a single listing.');
  const notes = [];
  const draft = TARGETS[target](facts, notes);
  if (sourceUrl) draft.source_url = sourceUrl;
  const photos = [photoUrl, ...facts.photos].filter(Boolean).map(p => new URL(p, sourceUrl || undefined).href);
  draft.image_url = photos.length ? await savePhoto(photos) : null;
  if (!draft.image_url) notes.push(photos.length ? 'The photo couldn’t be downloaded. Upload one yourself.' : 'No photo was imported. Upload one, or paste a photo link.');
  else if (facts.photos.length > 1) notes.push(`Imported the main photo (the listing has ${facts.photos.length}).`);
  if (sourceUrl) {
    const dupe = await db.prepare(`SELECT id FROM ${TABLES[target]} WHERE source_url = ?`).get(sourceUrl);
    if (dupe) notes.unshift('This link was imported before. Saving will create a second copy.');
  }
  notes.push('Seller contact details are never imported.');
  return { draft, notes, source: facts.source || (sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, '') : 'pasted text') };
}
