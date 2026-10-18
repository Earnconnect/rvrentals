// Search engine optimization: per-page titles, descriptions, canonical URLs, social tags, schema.org structured data,
// crawlable page content, sitemap.xml and robots.txt. Every public URL is rendered on the server with this data,
// so search engines see real content before any JavaScript runs.
import { db, getSettings } from './db.js';
import './public/js/regions.js';
const R = globalThis.RFRegions;

const BASE_URL = () => (process.env.BASE_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/$/, '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const parse = (s, d = []) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const abs = u => !u ? `${BASE_URL()}/img/og-image.jpg` : /^https?:/.test(u) ? u : BASE_URL() + (u.startsWith('/') ? u : '/' + u);

// Stock photo used for an item without an uploaded photo (mirrors public/js/art.js closely enough for previews).
const STOCK = { rv: 'class-c-camp', lot: 'site-aerial-b', camp: 'resort-palms', sale: 'class-a-road', saleLot: 'lot-lake' };
const photo = (item, kind) => abs(item?.image_url || `/img/photos/${STOCK[kind]}.jpg`);

function brand() {
  const s = getSettings();
  const full = s.business_name || 'STAYCAMPRV LLC';
  return { s, full, short: full.replace(/,?\s+(LLC|Inc\.?|Co\.?)$/i, '') };
}
const withBrand = (title, b) => `${title} | ${b.short}`;

// ---------- structured data ----------
function organization(b) {
  const { s } = b;
  return {
    '@context': 'https://schema.org', '@type': 'LocalBusiness', '@id': `${BASE_URL()}/#business`,
    name: b.full, url: `${BASE_URL()}/`, logo: abs('/img/icon-512.png'), image: abs('/img/photos/hero-lakeside.jpg'),
    description: s.tagline || undefined, email: s.email || undefined, telephone: s.phone || undefined,
    address: s.address ? { '@type': 'PostalAddress', streetAddress: s.address, addressRegion: R.stateOf(s.address) || undefined, addressCountry: 'US' } : undefined,
    priceRange: '$$',
    areaServed: R.locationsFrom(s).map(l => ({ '@type': 'State', name: l.name })),
    department: R.locationsFrom(s).filter(l => !l.hq).map(l => ({
      '@type': 'LocalBusiness', name: `${b.short} ${l.name}${l.role === 'Branch' ? ' Branch' : ''}`, url: `${BASE_URL()}/locations/${l.slug}`,
      telephone: l.phone || s.phone || undefined, address: { '@type': 'PostalAddress', addressLocality: l.city || undefined, addressRegion: l.code, addressCountry: 'US' }
    }))
  };
}
const website = b => ({ '@context': 'https://schema.org', '@type': 'WebSite', name: b.short, url: `${BASE_URL()}/`, publisher: { '@id': `${BASE_URL()}/#business` } });
const breadcrumbs = list => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: [['Home', '/'], ...list].map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: BASE_URL() + url }))
});
const itemList = (items) => ({
  '@context': 'https://schema.org', '@type': 'ItemList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, url: BASE_URL() + url }))
});

// ---------- crawlable fallback content (replaced by the app once JavaScript runs) ----------
const section = (h1, intro, links = [], extra = '') => `<div class="container seo-fallback">
  <h1>${esc(h1)}</h1>${intro ? `<p>${esc(intro)}</p>` : ''}${extra}
  ${links.length ? `<ul>${links.map(([label, url, note]) => `<li><a href="${esc(url)}">${esc(label)}</a>${note ? ` — ${esc(note)}` : ''}</li>`).join('')}</ul>` : ''}
</div>`;

// ---------- data ----------
const rvs = () => db.prepare("SELECT * FROM rvs WHERE status != 'retired' ORDER BY featured DESC, nightly_rate DESC").all();
const camps = () => db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM lots l WHERE l.campground_id = c.id AND l.status != 'closed') pads,
  (SELECT MIN(nightly_rate) FROM lots l WHERE l.campground_id = c.id AND l.status = 'active') from_rate,
  (SELECT MAX(nightly_rate) FROM lots l WHERE l.campground_id = c.id AND l.status = 'active') to_rate
  FROM campgrounds c WHERE c.status = 'active' ORDER BY c.featured DESC, c.sort_order, c.name`).all();
const pads = () => db.prepare(`SELECT l.*, c.name AS camp_name, c.location AS camp_location FROM lots l JOIN campgrounds c ON c.id = l.campground_id
  WHERE l.status != 'closed' AND c.status = 'active' ORDER BY c.sort_order, c.name, l.code`).all();
const listings = () => db.prepare(`SELECT * FROM sales WHERE status != 'sold' OR sold_at >= date('now', '-60 days')
  ORDER BY CASE status WHEN 'available' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, featured DESC, created_at DESC`).all();

// ---------- per-route SEO ----------
export async function seoFor(pathname, search = '') {
  const b = brand(), { s } = b;
  const p = (pathname || '/').replace(/\/+$/, '') || '/';
  const q = new URLSearchParams(search);
  const base = { status: 200, robots: 'index, follow', canonical: BASE_URL() + (p === '/' ? '/' : p), image: abs('/img/og-image.jpg'), type: 'website', jsonld: [] };
  let m;

  if (p === '/') {
    const r = (await rvs()).filter(x => x.status === 'active'), c = await camps();
    return {
      ...base,
      title: s.seo_title || `${b.short} — RV Rentals & Campgrounds in ${R.regionsLabel(s, true)}`,
      description: s.seo_description || clip(`RV rentals, full-hookup RV sites and RVs for sale in ${R.regionsLabel(s)}. Headquartered in ${R.STATES[R.hqCode(s)] || 'Florida'}. Book online with ${b.short}.`, 160),
      jsonld: [organization(b), website(b)],
      body: section(`${b.short}: RV rentals, RV sites and campgrounds in ${R.regionsLabel(s)}`, s.hero_subtitle, [
        ...R.locationsFrom(s).map(l => [`${l.name}${l.hq ? ' (headquarters)' : l.role === 'Branch' ? ' branch' : ''}`, `/locations/${l.slug}`, l.blurb]),
        ['RV rentals', '/rentals', `${r.length} motorhomes, camper vans and travel trailers`],
        ...c.map(x => [x.name, `/sites/park/${x.id}`, `${x.pads} RV sites in ${x.location || ''}${x.from_rate ? `, from ${money(x.from_rate)}/night` : ''}`]),
        ['RVs and RV lots for sale', '/sales'], ['Guest reviews', '/reviews'], ['Contact us', '/contact'], ['Policies & FAQ', '/policies']
      ])
    };
  }

  if (p === '/rentals') {
    const r = await rvs(), from = Math.min(...r.filter(x => x.status === 'active').map(x => x.nightly_rate));
    return {
      ...base, title: withBrand(`RV Rentals in ${R.regionsLabel(s, true)} — Motorhomes & Campers`, b),
      description: clip(`Rent one of ${r.length} road-checked RVs${isFinite(from) ? ` from ${money(from)}/night` : ''} with pickup in ${[...new Set(r.filter(x => x.status === 'active').map(x => R.STATES[R.rvState(x, s)]).filter(Boolean))].join(', ').replace(/, ([^,]*)$/, ' & $1')}: motorhomes, camper vans and trailers with weekly rates and 24/7 roadside help.`, 160),
      jsonld: [breadcrumbs([['RV rentals', '/rentals']]), itemList(r.map(x => [x.name, `/rentals/${x.id}`]))],
      body: section(`RV rentals in ${R.regionsLabel(s)}`, 'Every rental includes a hands-on walkthrough, 24/7 roadside assistance, a fresh water fill and a dump kit.',
        r.map(x => [`${x.name} — ${x.type}`, `/rentals/${x.id}`, `sleeps ${x.sleeps}, pickup in ${R.STATES[R.rvState(x, s)] || ''}, from ${money(x.nightly_rate)}/night`]))
    };
  }
  if ((m = p.match(/^\/rentals\/(\d+)$/))) {
    const x = await db.prepare("SELECT * FROM rvs WHERE id = ? AND status != 'retired'").get(Number(m[1]));
    if (!x) return notFound(b);
    const model = [x.year, x.make, x.model].filter(Boolean).join(' ');
    const features = parse(x.features);
    return {
      ...base, image: photo(x, 'rv'), type: 'product',
      title: withBrand(`${x.name} — ${model || x.type} RV Rental in ${R.STATES[R.rvState(x, s)] || ''}`.replace(/ in $/, ''), b),
      description: clip(`Rent the ${x.name}, a ${model ? model + ' ' : ''}${x.type.toLowerCase()} that sleeps ${x.sleeps}, with pickup in ${x.pickup_location || R.STATES[R.rvState(x, s)] || 'our main office'}, from ${money(x.nightly_rate)}/night${x.weekly_rate ? ` or ${money(x.weekly_rate)}/week` : ''}. ${x.description || ''}`, 158),
      jsonld: [breadcrumbs([['RV rentals', '/rentals'], [x.name, `/rentals/${x.id}`]]), {
        '@context': 'https://schema.org', '@type': 'Product', name: `${x.name} (${x.type}) rental`, description: x.description, image: photo(x, 'rv'),
        brand: x.make ? { '@type': 'Brand', name: x.make } : undefined, model: x.model || undefined, category: 'RV rental',
        offers: { '@type': 'Offer', price: x.nightly_rate, priceCurrency: 'USD', url: base.canonical, availability: x.status === 'active' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          priceSpecification: { '@type': 'UnitPriceSpecification', price: x.nightly_rate, priceCurrency: 'USD', unitText: 'night' }, seller: { '@id': `${BASE_URL()}/#business` } }
      }],
      body: section(`${x.name} — ${x.type} for rent`, x.description, [], `<p>${esc(model)} · Sleeps ${x.sleeps}${x.length_ft ? ` · ${x.length_ft} ft` : ''} · ${money(x.nightly_rate)}/night</p>${features.length ? `<ul>${features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}<p><a href="/rentals">All RV rentals</a></p>`)
    };
  }

  if (p === '/sites') {
    const c = await camps(), l = await pads();
    return {
      ...base, title: withBrand(`RV Sites & Campgrounds in ${R.regionsLabel(s, true)} — Full Hookups`, b),
      description: `Book one of ${l.length} full-hookup RV sites at ${c.map(x => x.name).join(', ')}. Nightly, weekly and monthly rates, pull-through sites for big rigs, and instant online booking.`.slice(0, 300),
      jsonld: [breadcrumbs([['RV sites', '/sites']]), itemList(c.map(x => [x.name, `/sites/park/${x.id}`]))],
      body: section(`RV sites and campgrounds in ${R.regionsLabel(s)}`, 'Every site has water, sewer, electric and Wi-Fi. Weekly and monthly rates apply automatically.',
        [...c.map(x => [x.name, `/sites/park/${x.id}`, `${x.location || ''} · ${x.pads} sites${x.from_rate ? ` from ${money(x.from_rate)}/night` : ''}`]),
         ...l.map(x => [`RV Site ${x.code} — ${x.camp_name}`, `/sites/${x.id}`, `${x.site_type}, up to ${x.max_length} ft, ${money(x.nightly_rate)}/night`])])
    };
  }
  if ((m = p.match(/^\/sites\/park\/(\d+)$/))) {
    const c = (await camps()).find(x => x.id === Number(m[1]));
    if (!c) return notFound(b);
    const l = (await pads()).filter(x => x.campground_id === c.id), amen = parse(c.amenities);
    const price = c.from_rate ? (c.to_rate && c.to_rate !== c.from_rate ? `${money(c.from_rate)}–${money(c.to_rate)} per night` : `${money(c.from_rate)} per night`) : undefined;
    return {
      ...base, image: photo(c, 'camp'),
      title: withBrand(`${c.name} — RV Sites in ${c.location || R.STATES[R.campState(c)] || ''}`, b),
      description: clip(`${c.pads} full-hookup RV sites at ${c.name} in ${c.location || R.STATES[R.campState(c)] || ''}${c.from_rate ? `, from ${money(c.from_rate)}/night` : ''}. ${c.description || ''}`, 158),
      jsonld: [breadcrumbs([['RV sites', '/sites'], [c.name, `/sites/park/${c.id}`]]), {
        '@context': 'https://schema.org', '@type': ['Campground', 'RVPark'], name: c.name, description: c.description, image: photo(c, 'camp'), url: base.canonical,
        address: { '@type': 'PostalAddress', streetAddress: c.address || undefined, addressLocality: (c.location || '').split(',')[0] || undefined, addressRegion: R.campState(c) || undefined, addressCountry: 'US' },
        telephone: s.phone || undefined, priceRange: price, petsAllowed: amen.some(a => /pet|dog/i.test(a)) || undefined,
        amenityFeature: amen.map(a => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })),
        containsPlace: l.map(x => ({ '@type': 'CampingPitch', name: `Site ${x.code}`, url: `${BASE_URL()}/sites/${x.id}` }))
      }],
      body: section(`${c.name} — RV sites in ${c.location || ''}`, c.description, l.map(x => [`RV Site ${x.code} (${x.section})`, `/sites/${x.id}`, `${x.site_type}, up to ${x.max_length} ft, ${x.amps} amp, ${money(x.nightly_rate)}/night`]),
        amen.length ? `<h2>Amenities</h2><ul>${amen.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '')
    };
  }
  if ((m = p.match(/^\/sites\/(\d+)$/))) {
    const x = (await pads()).find(l => l.id === Number(m[1]));
    if (!x) return notFound(b);
    return {
      ...base, image: photo(x, 'lot'),
      title: withBrand(`RV Site ${x.code} at ${x.camp_name}${x.camp_location ? ', ' + x.camp_location : ''}`, b),
      description: clip(`${x.site_type} RV site for rigs up to ${x.max_length} ft with ${x.amps} amp electric, water and sewer at ${x.camp_name}. ${money(x.nightly_rate)}/night${x.monthly_rate ? `, ${money(x.monthly_rate)}/month` : ''}. ${x.description || ''}`, 158),
      jsonld: [breadcrumbs([['RV sites', '/sites'], [x.camp_name, `/sites/park/${x.campground_id}`], [`Site ${x.code}`, `/sites/${x.id}`]]), {
        '@context': 'https://schema.org', '@type': 'CampingPitch', name: `RV Site ${x.code}`, description: x.description, image: photo(x, 'lot'), url: base.canonical,
        containedInPlace: { '@type': 'Campground', name: x.camp_name, url: `${BASE_URL()}/sites/park/${x.campground_id}` },
        amenityFeature: [x.water && 'Water hookup', x.sewer && 'Sewer hookup', `${x.amps} amp electric`, x.wifi && 'Wi-Fi'].filter(Boolean).map(a => ({ '@type': 'LocationFeatureSpecification', name: a, value: true }))
      }],
      body: section(`RV Site ${x.code} at ${x.camp_name}`, x.description, [[`All sites at ${x.camp_name}`, `/sites/park/${x.campground_id}`]],
        `<p>${esc(x.section)} · ${esc(x.site_type)} · up to ${x.max_length} ft · ${esc(x.amps)} amp · ${money(x.nightly_rate)}/night</p>`)
    };
  }

  if (p === '/sales') {
    const cat = q.get('category');
    const l = (await listings()).filter(x => !cat || x.category === cat);
    const where = R.regionsLabel(s, true), what = cat === 'lot' ? 'RV Lots for Sale' : cat === 'rv' ? `RVs for Sale in ${where}` : `RVs & RV Lots for Sale in ${where}`;
    return {
      ...base, canonical: BASE_URL() + '/sales' + (cat === 'lot' || cat === 'rv' ? `?category=${cat}` : ''),
      title: withBrand(what, b),
      description: cat === 'lot' ? 'Deeded RV lots for sale with HOA amenities and rental program eligibility. Financing available.'
        : clip(`Inspected new and pre-owned motorhomes, travel trailers and deeded RV lots for sale across ${R.regionsLabel(s)}. Trade-ins and financing available.`, 160),
      jsonld: [breadcrumbs([['For sale', '/sales']]), itemList(l.map(x => [x.title, `/sales/${x.id}`]))],
      body: section(what, 'Every pre-owned RV passes a 120-point inspection by our service team.', l.map(x => [x.title, `/sales/${x.id}`, `${money(x.price)}${x.status !== 'available' ? ` (${x.status})` : ''}`]))
    };
  }
  if ((m = p.match(/^\/sales\/(\d+)$/))) {
    const x = (await listings()).find(l => l.id === Number(m[1]));
    if (!x) return notFound(b);
    const isLot = x.category === 'lot', img = photo(x, isLot ? 'saleLot' : 'sale');
    const offer = { '@type': 'Offer', price: x.price, priceCurrency: 'USD', url: base.canonical, seller: { '@id': `${BASE_URL()}/#business` },
      availability: x.status === 'sold' ? 'https://schema.org/SoldOut' : x.status === 'pending' ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock',
      itemCondition: x.condition === 'New' ? 'https://schema.org/NewCondition' : isLot ? undefined : 'https://schema.org/UsedCondition' };
    return {
      ...base, image: img, type: 'product',
      title: withBrand(`${x.title} for Sale — ${money(x.price)}`, b),
      description: clip(`${x.title} for sale${x.location ? ` at ${x.location}` : ''} for ${money(x.price)}. ${x.description || ''}`, 158),
      jsonld: [breadcrumbs([['For sale', '/sales'], [x.title, `/sales/${x.id}`]]), isLot
        ? { '@context': 'https://schema.org', '@type': 'Product', name: x.title, description: x.description, image: img, category: 'RV lot (land)', offers: offer }
        : { '@context': 'https://schema.org', '@type': 'Vehicle', name: x.title, description: x.description, image: img, brand: x.make ? { '@type': 'Brand', name: x.make } : undefined,
            model: x.model || undefined, vehicleModelDate: x.year ? String(x.year) : undefined, bodyType: x.type || undefined,
            mileageFromOdometer: x.mileage != null ? { '@type': 'QuantitativeValue', value: x.mileage, unitCode: 'SMI' } : undefined, offers: offer }],
      body: section(`${x.title} for sale`, x.description, [['All listings', '/sales']], `<p>${money(x.price)}${x.location ? ` · ${esc(x.location)}` : ''}${x.lot_size ? ` · ${esc(x.lot_size)}` : ''}</p>`)
    };
  }

  if (p === '/locations') {
    const locs = R.locationsFrom(s);
    return {
      ...base, title: withBrand(`Locations — RV Rentals & Campgrounds in ${R.regionsLabel(s, true)}`, b),
      description: clip(`${b.short} operates in ${R.regionsLabel(s)}, with headquarters in ${R.STATES[R.hqCode(s)] || 'Florida'}. Find RV rentals, campgrounds and contacts in each state.`, 160),
      jsonld: [breadcrumbs([['Locations', '/locations']]), organization(b)],
      body: section('Where we are', `Headquartered in ${R.STATES[R.hqCode(s)] || ''}, serving ${R.regionsLabel(s)}.`, locs.map(l => [`${l.name}${l.hq ? ' — headquarters' : l.role === 'Branch' ? ' — branch' : ''}`, `/locations/${l.slug}`, l.blurb]))
    };
  }
  if ((m = p.match(/^\/locations\/([a-z-]+)$/))) {
    const l = R.locationsFrom(s).find(x => x.slug === m[1]);
    if (!l) return notFound(b);
    const cs = (await camps()).filter(c => R.campState(c) === l.code), rs = (await rvs()).filter(r => r.status === 'active' && R.rvState(r, s) === l.code);
    const label = l.hq ? 'Headquarters' : l.role === 'Branch' ? 'Branch' : 'Location';
    return {
      ...base, image: abs(`/img/photos/${l.photo}.jpg`),
      title: withBrand(`RV Rentals & RV Sites in ${l.name}${l.city ? ` — ${l.city}` : ''}`, b),
      description: clip(`${b.short} in ${l.city ? l.city + ', ' : ''}${l.name}: ${rs.length ? `${rs.length} RV rental${rs.length === 1 ? '' : 's'}` : 'RV rentals'}${cs.length ? `, ${cs.length} campground${cs.length === 1 ? '' : 's'}` : ''} and RV sales. ${l.blurb || ''}`, 160),
      jsonld: [breadcrumbs([['Locations', '/locations'], [l.name, `/locations/${l.slug}`]]), {
        '@context': 'https://schema.org', '@type': 'LocalBusiness', name: `${b.short} ${l.name}${l.role === 'Branch' ? ' Branch' : ''}`, url: base.canonical,
        image: abs(`/img/photos/${l.photo}.jpg`), telephone: l.phone || s.phone || undefined, email: s.email || undefined, parentOrganization: { '@id': `${BASE_URL()}/#business` },
        address: l.hq && s.address ? { '@type': 'PostalAddress', streetAddress: s.address, addressRegion: l.code, addressCountry: 'US' } : { '@type': 'PostalAddress', addressLocality: l.city || undefined, addressRegion: l.code, addressCountry: 'US' },
        areaServed: { '@type': 'State', name: l.name }
      }],
      body: section(`${b.short} in ${l.name}`, `${label}${l.city ? ` · ${l.city}` : ''}. ${l.blurb || ''}`,
        [...cs.map(c => [c.name, `/sites/park/${c.id}`, `${c.pads} RV sites in ${c.location || ''}`]), ...rs.map(r => [`${r.name} — ${r.type}`, `/rentals/${r.id}`, `from ${money(r.nightly_rate)}/night`]), ['All locations', '/locations']])
    };
  }
  if (p === '/reviews') {
    const t = await db.prepare("SELECT name, location, quote, rating, stay FROM testimonials WHERE status = 'published' ORDER BY featured DESC, created_at DESC LIMIT 60").all();
    return {
      ...base, title: withBrand('Guest Reviews — RV Rentals & RV Sites', b),
      description: t.length ? `Read ${t.length} review${t.length === 1 ? '' : 's'} from guests who rented an RV or stayed at our campgrounds.` : 'Reviews from guests who rented an RV or stayed at our campgrounds.',
      jsonld: [breadcrumbs([['Reviews', '/reviews']])],
      body: section('What our guests say', '', [], t.map(x => `<blockquote><p>${esc(x.quote)}</p><footer>${esc(x.name)}${x.location ? `, ${esc(x.location)}` : ''}${x.stay ? ` — ${esc(x.stay)}` : ''}</footer></blockquote>`).join(''))
    };
  }
  if (p === '/policies') {
    const faq = (s.faq || []).filter(f => f.q && f.a);
    return {
      ...base, title: withBrand('Policies & FAQ — RV Rental and RV Site Questions', b),
      description: 'Answers to common questions about renting an RV, booking an RV site, cancellations, deposits, pets and more.',
      jsonld: [breadcrumbs([['Policies & FAQ', '/policies']]), faq.length ? { '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) } : null].filter(Boolean),
      body: section('Policies & frequently asked questions', s.cancellation_policy, [], faq.map(f => `<h2>${esc(f.q)}</h2><p>${esc(f.a)}</p>`).join(''))
    };
  }
  if (p === '/contact') {
    return {
      ...base, title: withBrand('Contact Us — RV Rentals, Sites & Sales', b),
      description: `Questions about an RV rental, an RV site or a listing? Call ${s.phone || 'us'}, email ${s.email || 'us'}, or chat with our team.`,
      jsonld: [breadcrumbs([['Contact', '/contact']]), organization(b)],
      body: section(`Contact ${b.short}`, `${s.address || ''} · ${s.phone || ''} · ${s.email || ''} · ${s.hours || ''}`)
    };
  }
  if ((m = p.match(/^\/legal(?:\/([a-z-]+))?$/))) {
    const names = { terms: 'Terms of Service', privacy: 'Privacy Policy', cancellation: 'Cancellation & Refund Policy', accessibility: 'Accessibility Statement' };
    const slug = m[1] || 'terms';
    if (!names[slug]) return notFound(b);
    return { ...base, canonical: `${BASE_URL()}/legal/${slug}`, title: withBrand(names[slug], b), description: `${names[slug]} for ${b.full}.`,
      jsonld: [breadcrumbs([['Legal', '/legal/terms'], [names[slug], `/legal/${slug}`]])], body: section(names[slug], `${names[slug]} for ${b.full}.`) };
  }
  if (p === '/manage' || /^\/booking\//.test(p)) {
    return { ...base, robots: 'noindex, nofollow', title: withBrand(p === '/manage' ? 'Manage Your Booking' : 'Your Booking', b), description: 'View, pay for or cancel your booking.', body: '' };
  }
  return notFound(b);
}
function notFound(b) {
  return { status: 404, robots: 'noindex, follow', canonical: null, image: abs(), type: 'website', jsonld: [], title: withBrand('Page not found', b), description: 'That page doesn’t exist.',
    body: section('Page not found', 'That page doesn’t exist.', [['Home', '/'], ['RV rentals', '/rentals'], ['RV sites', '/sites']]) };
}

// ---------- HTML injection ----------
const ld = obj => JSON.stringify(obj, (k, v) => (v === undefined || v === null || (Array.isArray(v) && !v.length) ? undefined : v)).replace(/</g, '\\u003c');
export function headTags(seo) {
  const s = getSettings(), b = brand();
  return [
    `<title>${esc(seo.title)}</title>`,
    `<meta name="description" content="${esc(seo.description)}">`,
    `<meta name="robots" content="${seo.robots}">`,
    seo.canonical ? `<link rel="canonical" href="${esc(seo.canonical)}">` : '',
    `<meta property="og:type" content="${seo.type}">`,
    `<meta property="og:site_name" content="${esc(b.short)}">`,
    `<meta property="og:title" content="${esc(seo.title)}">`,
    `<meta property="og:description" content="${esc(seo.description)}">`,
    seo.canonical ? `<meta property="og:url" content="${esc(seo.canonical)}">` : '',
    `<meta property="og:image" content="${esc(seo.image)}">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(seo.title)}">`,
    `<meta name="twitter:description" content="${esc(seo.description)}">`,
    `<meta name="twitter:image" content="${esc(seo.image)}">`,
    s.google_site_verification ? `<meta name="google-site-verification" content="${esc(s.google_site_verification)}">` : '',
    ...seo.jsonld.map(j => `<script type="application/ld+json">${ld(j)}</script>`)
  ].filter(Boolean).join('\n  ');
}
export function renderPage(template, seo) {
  return template.replace('<!--SEO_HEAD-->', headTags(seo)).replace('<!--SEO_BODY-->', seo.body || '');
}
// What the app needs to update the page after client-side navigation.
export const seoJson = seo => ({ status: seo.status, title: seo.title, description: seo.description, robots: seo.robots, canonical: seo.canonical, image: seo.image, jsonld: seo.jsonld });

// ---------- sitemap & robots ----------
export async function sitemapXml() {
  const day = d => (d ? String(d).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const urls = [
    ['/', 'daily', '1.0'], ['/rentals', 'daily', '0.9'], ['/sites', 'daily', '0.9'], ['/sales', 'daily', '0.8'],
    ['/sales?category=rv', 'weekly', '0.6'], ['/sales?category=lot', 'weekly', '0.6'],
    ...(await camps()).map(c => [`/sites/park/${c.id}`, 'weekly', '0.9', c.created_at]),
    ...(await rvs()).map(r => [`/rentals/${r.id}`, 'weekly', '0.8', r.created_at]),
    ...(await listings()).map(x => [`/sales/${x.id}`, 'weekly', '0.7', x.created_at]),
    ...(await pads()).map(l => [`/sites/${l.id}`, 'monthly', '0.5', l.created_at]),
    ['/locations', 'monthly', '0.8'], ...R.locationsFrom(getSettings()).map(l => [`/locations/${l.slug}`, 'weekly', '0.9']),
    ['/reviews', 'weekly', '0.6'], ['/contact', 'monthly', '0.5'], ['/policies', 'monthly', '0.5'],
    ...['terms', 'privacy', 'cancellation', 'accessibility'].map(x => [`/legal/${x}`, 'yearly', '0.2'])
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, f, pr, d]) => `  <url><loc>${esc(BASE_URL() + u)}</loc><lastmod>${day(d)}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}
</urlset>
`;
}
export const robotsTxt = () => `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /booking/
Disallow: /manage

Sitemap: ${BASE_URL()}/sitemap.xml
`;
