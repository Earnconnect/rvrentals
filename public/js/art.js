// Photo library + brand mark. Every listing gets a real photo, even before staff upload their own.
// Stock photos are from Pexels (free for commercial use). Uploaded photos (image_url) always win.
(function () {
  const attr = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const src = (key, large) => `/img/photos/${large ? '' : 'sm/'}${key}.jpg`;
  const img = (key, alt, { large = false, eager = false } = {}) =>
    `<img src="${src(key, large)}" alt="${attr(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;

  // Specific photos for the seeded inventory, so the fleet doesn't look repetitive.
  const BY_NAME = {
    'coral breeze': 'class-a', 'palm voyager': 'class-c-camp', 'key west nomad': 'van-lake', 'hibiscus classic': 'airstream-field',
    'everglades estate': 'trailer-lake', 'gulf coast toy box': 'toy-hauler', 'orange blossom': 'class-c-surf', 'mangrove mini': 'trailer-classic',
    '2019 tiffin allegro red 33aa': 'class-a-road', '2021 forest river sunseeker 3050s': 'class-c-mountain',
    '2020 airstream classic 30rb': 'airstream-city', '2025 grand design imagine 2800bh': 'trailer-sea',
    'deeded lakefront rv lot w-12': 'lot-lake', 'corner rv lot l-7 with casita pad': 'lot-forsale', 'interior rv lot l-15': 'lot-palm-path'
  };
  // Fallback pools by type, picked deterministically per item.
  const POOLS = {
    classA: ['class-a', 'class-a-road'],
    classB: ['van-lake', 'van-coast'],
    classC: ['class-c-camp', 'class-c-surf', 'class-c-mountain', 'class-c-field', 'class-c-bikes'],
    airstream: ['airstream-field', 'airstream-city'],
    trailer: ['trailer-classic', 'trailer-sea', 'teardrop', 'trailer-lake'],
    fifth: ['trailer-lake', 'trailer-classic'],
    toy: ['toy-hauler'],
    lot: ['lot-lake', 'lot-forsale', 'lot-palm-path', 'lot-waterfront'],
    site: ['site-coastal', 'site-aerial-a', 'site-palms', 'site-park', 'site-aerial-b']
  };
  const SECTION = { A: 'site-coastal', B: 'site-aerial-a', C: 'site-palms', D: 'site-park' };
  // Pads: pick a photo that fits the section (waterfront, pull-through, garden, long stay), varied per pad.
  const SECTION_POOLS = [
    [/ocean|water|lake|bay|beach|river|shore/i, ['site-coastal', 'lot-lake']],
    [/pull|big rig/i, ['site-aerial-a', 'site-aerial-b']],
    [/garden|tropical|shade|palm|wood|forest/i, ['site-palms', 'resort-palms', 'life-camp']],
    [/extended|month|season|long/i, ['site-park', 'site-aerial-b']]
  ];
  const CAMPS = { 'staycamprv resort': 'resort-palms', 'staycamprv keys campground': 'site-coastal' };
  const CAMP_POOL = ['resort-palms', 'site-coastal', 'site-aerial-b', 'site-park', 'lot-lake'];
  const hash = s => [...String(s ?? '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pick = (pool, seed) => pool[hash(seed) % pool.length];

  function rvKey(type, seed, make) {
    const t = String(type || '').toLowerCase();
    if (/airstream/i.test(make || '') || /airstream/i.test(seed || '')) return pick(POOLS.airstream, seed);
    if (t.includes('class a')) return pick(POOLS.classA, seed);
    if (t.includes('class b') || t.includes('van')) return pick(POOLS.classB, seed);
    if (t.includes('class c') || t.includes('motorhome')) return pick(POOLS.classC, seed);
    if (t.includes('toy')) return pick(POOLS.toy, seed);
    if (t.includes('fifth')) return pick(POOLS.fifth, seed);
    return pick(POOLS.trailer, seed);
  }
  function keyFor(kind, item = {}) {
    const named = BY_NAME[String(item.name || item.title || '').trim().toLowerCase()];
    if (named) return named;
    if (kind === 'camp') return CAMPS[String(item.name || '').trim().toLowerCase()] || pick(CAMP_POOL, item.name);
    if (kind === 'lot') {
      const pool = SECTION_POOLS.find(([re]) => re.test(item.section || ''));
      if (pool) return pick(pool[1], `${item.campground_id}-${item.code}`);
      return SECTION[String(item.section || item.code || '').trim().charAt(0).toUpperCase()] || pick(POOLS.site, item.code);
    }
    if (kind === 'sale' && item.category === 'lot') return /lake|water/i.test((item.title || '') + (item.location || '')) ? 'lot-lake' : pick(POOLS.lot, item.title);
    return rvKey(item.type, item.name || item.title || item.id, item.make);
  }
  const altFor = (kind, item = {}) => kind === 'lot' ? `RV site ${item.code || ''}${item.campground_name ? ' at ' + item.campground_name : ''}` : kind === 'camp' ? (item.name || 'Campground') : (item.name || item.title || item.type || 'RV');
  const motorized = item => /class|van|motorhome/i.test(item?.type || '');

  // Brand assets live in /img (generated SVGs with outlined lettering, so they render identically everywhere).
  const logo = (size = 40) => `<img class="logo-mark" src="/img/logo-mark.svg" width="${size}" height="${size}" alt="">`;
  const lockup = (light = false) => `<img class="brand-logo" src="/img/${light ? 'logo-light' : 'logo'}.svg" width="288" height="64" alt="STAYCAMPRV">`;

  window.RFArt = {
    logo, lockup,
    photo: (key, alt = '', opts) => img(key, alt, opts),
    url: (key, large = true) => src(key, large),
    rv: (type, _color, opts) => img(rvKey(type, type), type || 'RV', opts),
    site: (lot, opts) => img(keyFor('lot', lot), altFor('lot', lot), opts),
    landLot: (listing, opts) => img(keyFor('sale', { category: 'lot', ...listing }), listing?.title || 'RV lot', opts),
    forItem(kind, item, opts = {}) {
      if (item?.image_url) return `<img src="${attr(item.image_url)}" alt="${attr(altFor(kind, item))}" loading="lazy" decoding="async">`;
      return img(keyFor(kind, item), altFor(kind, item), opts);
    },
    // Main photo plus supporting shots for detail pages. `representative` is true when stock photos are used.
    gallery(kind, item = {}) {
      if (item.image_url) return { photos: [{ url: item.image_url, alt: altFor(kind, item) }], representative: false };
      const main = keyFor(kind, item);
      const extra = kind === 'lot' ? ['resort-palms', 'band-sunset', 'lily-lake']
        : kind === 'sale' && item.category === 'lot' ? ['palms-sky', 'band-sunset', 'resort-palms']
        : motorized(item) ? ['interior-lounge', 'interior-cab', 'interior-bedroom'] : ['interior-kitchen', 'interior-bedroom', 'life-camp'];
      return { photos: [main, ...extra].map(k => ({ url: src(k, true), alt: altFor(kind, item) })), representative: true };
    }
  };
})();
