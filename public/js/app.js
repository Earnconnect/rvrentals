// STAYCAMPRV LLC — public single-page app.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const app = $('#app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Long descriptions keep their paragraphs (blank lines) and line breaks.
  const paras = s => String(s ?? '').trim().split(/\n\s*\n/).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  const money = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const money2 = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad2 = n => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const nightsBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  const addMonths = (first, m) => { const [y, mo] = first.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + m, 1)).toISOString().slice(0, 10); };
  const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const fmtDate = (s, opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', opts) : '—';
  const art = (kind, item, opts) => window.RFArt.forItem(kind, item, opts);
  const photo = (key, alt, opts) => window.RFArt.photo(key, alt, opts);
  let S = {};

  const ICONS = {
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    road: '<path d="M8 3L4 21M16 3l4 18M12 5v2M12 11v2M12 17v2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    plug: '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 01-12 0zM12 17v5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  const banner = (eyebrow, title, text, key) => `<section class="page-banner">${photo(key, '', { large: true, eager: true })}
    <div class="container"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${text ? `<p>${text}</p>` : ''}</div></section>`;
  const assurance = () => `<div class="assurance">
    <div>${icon('lock')}Secure booking · instant confirmation code</div>
    <div>${icon('calendar')}Taxes and fees shown before you book</div>
    <div>${icon('mail')}Questions? <a href="mailto:${esc(S.email)}">${esc(S.email)}</a></div></div>`;

  function gallery(kind, item) {
    const g = window.RFArt.gallery(kind, item);
    const html = `<div class="gallery ${g.photos.length === 1 ? 'single' : ''}">${g.photos.map((p, i) => `<button type="button" data-i="${i}" aria-label="View photo ${i + 1}"><img src="${esc(p.url)}" alt="${esc(p.alt)}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}></button>`).join('')}</div>
      ${g.representative ? '<p class="gallery-note">Representative photos. Ask us for current photos of this exact unit.</p>' : ''}`;
    return { html, bind(root) { $$('.gallery button', root).forEach(b => b.onclick = () => lightbox(g.photos.map(p => p.url), Number(b.dataset.i))); } };
  }
  function lightbox(urls, i) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<img alt=""><button class="lb-close" aria-label="Close">×</button>${urls.length > 1 ? '<button class="lb-prev" aria-label="Previous">‹</button><button class="lb-next" aria-label="Next">›</button>' : ''}`;
    const show = () => { $('img', lb).src = urls[i]; };
    const step = d => { i = (i + d + urls.length) % urls.length; show(); };
    const close = () => { lb.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); };
    lb.onclick = e => { if (e.target === lb || e.target.classList.contains('lb-close')) close(); if (e.target.classList.contains('lb-prev')) step(-1); if (e.target.classList.contains('lb-next')) step(1); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(lb);
    show();
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }
  function toast(msg, error = false) {
    const t = document.createElement('div');
    t.className = 'toast' + (error ? ' error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3800);
  }
  const qsOf = obj => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(obj)) if (v !== '' && v != null) p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };
  const formData = form => Object.fromEntries(new FormData(form).entries());
  const statusPill = s => `<span class="status-pill st-${esc(s)}">${esc(String(s).replace('_', ' '))}</span>`;

  // ---------------- router ----------------
  const routes = [
    [/^\/?$/, home],
    [/^\/rentals$/, rentals],
    [/^\/rentals\/(\d+)$/, rvDetail],
    [/^\/sites$/, sites],
    [/^\/sites\/park\/(\d+)$/, campground],
    [/^\/sites\/(\d+)$/, siteDetail],
    [/^\/sales$/, sales],
    [/^\/sales\/(\d+)$/, saleDetail],
    [/^\/booking\/([A-Za-z0-9-]+)$/, bookingView],
    [/^\/manage$/, manage],
    [/^\/contact$/, contact],
    [/^\/policies$/, policies],
    [/^\/reviews$/, reviews],
    [/^\/locations$/, locations],
    [/^\/locations\/([a-z-]+)$/, locationPage],
    [/^\/legal(?:\/([a-z-]+))?$/, legal]
  ];
  let lastPath = null;
  // Every page opens at the top: don't let the browser restore an old scroll position on reload or Back.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  async function render() {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const query = location.search.slice(1);
    const q = Object.fromEntries(new URLSearchParams(query));
    $('#nav').classList.remove('open');
    $$('#nav a').forEach(a => a.classList.toggle('active', path.startsWith('/' + a.dataset.nav)));
    const first = lastPath === null, samePage = path === lastPath;
    lastPath = path;
    // The server already sent this page's search data and readable content; keep it visible until the app renders.
    if (!first) updateSeo();
    if (!samePage && !first) { window.scrollTo(0, 0); app.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>'; }
    if (first && !app.children.length) app.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';
    for (const [re, fn] of routes) {
      const m = path.match(re);
      if (m) {
        try { await fn(m.slice(1), q); }
        catch (e) { app.innerHTML = `<div class="container loading"><h2>Something went wrong</h2><p>${esc(e.message)}</p><a class="btn btn-dark" href="/">Back home</a></div>`; }
        // The page's height changes once it renders, so make sure it starts at the top (links to a #section are left alone).
        if ((first || !samePage) && !location.hash) window.scrollTo(0, 0);
        return;
      }
    }
    app.innerHTML = `<div class="container loading"><h2>Page not found</h2><p>That page doesn’t exist.</p><a class="btn btn-dark" href="/">Back home</a></div>`;
  }
  // Clean URLs (/rentals/1) so every page can be indexed. Internal links are handled without a full page load.
  function navigate(url, { replace = false } = {}) {
    url = String(url).replace(/^#/, '') || '/';
    if (url === location.pathname + location.search) return render();
    history[replace ? 'replaceState' : 'pushState'](null, '', url);
    render();
  }
  window.addEventListener('popstate', render);
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href.startsWith('/') || href.startsWith('//') || /^\/(admin|api|uploads|img|css|js)(\/|$)/.test(href) || /\.[a-z0-9]+(\?|$)/i.test(href.split('?')[0])) return;
    e.preventDefault();
    navigate(href);
  });
  // Old #/ links (bookmarks, earlier emails) keep working.
  if (location.hash.startsWith('#' + '/')) { history.replaceState(null, '', location.hash.slice(1)); queueMicrotask(() => updateSeo()); }
  window.addEventListener('hashchange', () => { if (location.hash.startsWith('#' + '/')) navigate(location.hash.slice(1), { replace: true }); });

  // Keep title, description, canonical and structured data in sync after in-app navigation.
  let seoSeq = 0;
  async function updateSeo() {
    const seq = ++seoSeq;
    try {
      const m = await fetch('/api/seo?path=' + encodeURIComponent(location.pathname + location.search)).then(r => r.json());
      if (seq !== seoSeq) return;
      document.title = m.title;
      const meta = (attr, key, val) => {
        let el = document.head.querySelector(`meta[${attr}="${key}"]`);
        if (!val) { el?.remove(); return; }
        if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
        el.setAttribute('content', val);
      };
      meta('name', 'description', m.description); meta('name', 'robots', m.robots);
      meta('property', 'og:title', m.title); meta('property', 'og:description', m.description); meta('property', 'og:image', m.image); meta('property', 'og:url', m.canonical);
      meta('name', 'twitter:title', m.title); meta('name', 'twitter:description', m.description); meta('name', 'twitter:image', m.image);
      let link = document.head.querySelector('link[rel="canonical"]');
      if (m.canonical) { if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); } link.href = m.canonical; } else link?.remove();
      document.head.querySelectorAll('script[type="application/ld+json"]').forEach(x => x.remove());
      for (const j of m.jsonld || []) { const sc = document.createElement('script'); sc.type = 'application/ld+json'; sc.textContent = JSON.stringify(j); document.head.appendChild(sc); }
    } catch {}
  }

  // ---------------- shared pieces ----------------
  const stars = n => `<span class="stars" role="img" aria-label="${n} out of 5 stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
  const testimonialCard = t => `<figure class="testimonial">
      ${stars(t.rating || 5)}
      <blockquote>${esc(t.quote)}</blockquote>
      <figcaption><span class="avatar" aria-hidden="true">${esc(String(t.name || '?').trim().charAt(0).toUpperCase())}</span>
        <span><strong>${esc(t.name)}</strong>${t.location ? `<br><span class="muted small">${esc(t.location)}</span>` : ''}${t.stay ? `<br><span class="muted small">${esc(t.stay)}</span>` : ''}</span></figcaption>
    </figure>`;
  function rvCard(rv, q = {}) {
    const unavailable = !rv.available;
    return `<a class="card ${unavailable ? 'unavailable' : ''}" href="/rentals/${rv.id}${qsOf({ start: q.start, end: q.end })}">
      ${rv.status === 'maintenance' ? '<span class="badge warn">In service</span>' : unavailable ? '<span class="badge gray">Booked for your dates</span>' : rv.featured ? '<span class="badge sun">Guest favorite</span>' : ''}
      <div class="media">${art('rv', rv)}</div>
      <div class="content">
        <span class="eyebrow" style="margin:0">${esc(rv.type)}</span>
        <h3>${esc(rv.name)}</h3>
        <div class="meta">${esc([rv.year, rv.make, rv.model].filter(Boolean).join(' '))}</div>
        <div class="specs"><span class="chip chip-loc">${esc(R.rvState(rv, S) || '')}</span><span class="chip">Sleeps ${esc(rv.sleeps)}</span>${rv.length_ft ? `<span class="chip">${esc(rv.length_ft)} ft</span>` : ''}<span class="chip">${rv.miles_per_night ? esc(rv.miles_per_night) + ' mi/night' : 'Towable'}</span></div>
        <div class="price-row"><div class="price">${money(rv.nightly_rate)} <small>/ night</small></div><span class="small muted">${rv.weekly_rate ? money(rv.weekly_rate) + '/wk' : ''}</span></div>
      </div></a>`;
  }
  function saleCard(s) {
    const specs = s.category === 'lot'
      ? [s.lot_size, s.condition].filter(Boolean)
      : [s.year, s.length_ft && s.length_ft + ' ft', s.mileage != null && s.mileage !== '' && Number(s.mileage).toLocaleString() + ' mi', s.sleeps && 'Sleeps ' + s.sleeps].filter(Boolean);
    return `<a class="card" href="/sales/${s.id}">
      ${s.status === 'sold' ? '<span class="badge gray">Sold</span>' : s.status === 'pending' ? '<span class="badge warn">Sale pending</span>' : s.condition === 'New' ? '<span class="badge sun">New</span>' : s.featured ? '<span class="badge">Featured</span>' : ''}
      <div class="media">${art('sale', s)}</div>
      <div class="content">
        <span class="eyebrow" style="margin:0">${esc(s.type || (s.category === 'lot' ? 'RV Lot' : 'RV'))}</span>
        <h3>${esc(s.title)}</h3>
        ${s.location ? `<div class="meta">${esc(s.location)}</div>` : ''}
        <div class="specs">${specs.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>
        <div class="price-row"><div class="price">${money(s.price)}</div><span class="small muted">Est. ${money(loanPayment(s.price * 0.8, 7.99, s.category === 'lot' ? 15 : 15))}/mo</span></div>
      </div></a>`;
  }
  function loanPayment(principal, apr, years) {
    const r = apr / 100 / 12, n = years * 12;
    if (principal <= 0) return 0;
    return r === 0 ? principal / n : principal * r / (1 - Math.pow(1 + r, -n));
  }

  // ---------------- calendar ----------------
  function calendar(el, { booked = [], start, end, minNights = 1, onChange }) {
    const today = todayStr();
    let s = start || null, e = end || null;
    let view = (s || today).slice(0, 7) + '-01';
    const bookedNight = d => booked.some(b => d >= b.start && d < b.end);
    const free = (a, b) => { for (let d = a; d < b; d = addDays(d, 1)) if (bookedNight(d)) return false; return true; };
    const canEnd = d => s && !e && d >= addDays(s, minNights) && free(s, d);
    // While choosing a check-out date, nights inside the minimum stay can't be picked.
    const tooShort = d => s && !e && d > s && d < addDays(s, minNights);
    function draw() {
      const [y, mo] = view.split('-').map(Number);
      const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const lead = new Date(view + 'T00:00:00Z').getUTCDay();
      let cells = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="dow">${d}</div>`).join('') + '<div></div>'.repeat(lead);
      for (let day = 1; day <= dim; day++) {
        const d = `${y}-${pad2(mo)}-${pad2(day)}`;
        const bk = bookedNight(d), ce = canEnd(d);
        const short = tooShort(d);
        const cls = ['cal-day', bk && 'booked', bk && ce && 'can-end', (d === s || d === e) && 'sel', s && e && d > s && d < e && 'in-range', short && 'too-short', d === today && 'today'].filter(Boolean).join(' ');
        cells += `<button type="button" class="${cls}" data-d="${d}" ${d < today || (bk && !ce) || short ? 'disabled' : ''}>${day}</button>`;
      }
      el.innerHTML = `<div class="cal">
        <div class="cal-head"><button type="button" data-step="-1" ${view <= today.slice(0, 7) + '-01' ? 'disabled' : ''} aria-label="Previous month">‹</button>
          <strong>${new Date(view + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
          <button type="button" data-step="1" aria-label="Next month">›</button></div>
        <div class="cal-grid">${cells}</div>
        <div class="cal-legend"><span><i style="background:var(--sun)"></i>Selected</span><span><i style="background:#e6dfd2"></i>Booked</span>
          <span class="muted">${s && !e ? `Now choose your check-out date${minNights > 1 ? ` (${minNights}-night minimum)` : ''}` : 'Choose your check-in date'}</span></div></div>`;
    }
    el.addEventListener('click', ev => {
      const step = ev.target.closest('[data-step]');
      if (step) { view = addMonths(view, Number(step.dataset.step)); draw(); return; }
      const btn = ev.target.closest('[data-d]');
      if (!btn || btn.disabled) return;
      const d = btn.dataset.d;
      if (canEnd(d)) e = d;
      else { if (bookedNight(d) || d < today) return; s = d; e = null; }
      draw();
      onChange(s, e);
    });
    draw();
    return { clear() { s = e = null; draw(); onChange(null, null); } };
  }

  // ---------------- booking widget ----------------
  function bookingWidget(el, kind, item, q) {
    const isRv = kind === 'rv';
    const addons = (isRv ? S.rv_addons : S.lot_addons) || [];
    const st = {
      start: isDate(q.start) ? q.start : null, end: isDate(q.end) && q.end > q.start ? q.end : null,
      addons: new Set(), guests: Math.min(Number(q.guests) || 2, isRv ? item.sleeps : S.max_site_guests || 8),
      rig_length: q.len || '', rig_type: '', quote: null, error: '', step: 'dates', seq: 0
    };
    if (st.start && st.start < todayStr()) st.start = st.end = null;
    const maxGuests = isRv ? item.sleeps : (S.max_site_guests || 8);
    const label = isRv ? ['Pickup', 'Return'] : ['Check-in', 'Check-out'];
    // Keep the chosen dates in the address bar, so a refresh or a shared link keeps them.
    const keepInUrl = () => {
      const p = new URLSearchParams(location.search);
      for (const [k, v] of [['start', st.start], ['end', st.end], ['guests', st.guests]]) v ? p.set(k, v) : p.delete(k);
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    };
    // Remember the guest's contact details on this device (and their notes while they change dates).
    const GUEST_KEY = 'rf_guest';
    const savedGuest = () => { try { return JSON.parse(localStorage.getItem(GUEST_KEY)) || {}; } catch { return {}; } };
    const saveGuest = g => { try { localStorage.setItem(GUEST_KEY, JSON.stringify(g)); } catch {} };

    async function refreshQuote() {
      const box = $('#quoteBox', el), btn = $('#continueBtn', el);
      if (!box) return;
      if (!st.start || !st.end) { st.quote = null; box.innerHTML = '<p class="small muted" style="margin:0">Select your dates to see the total price.</p>'; btn.disabled = true; updateBar(); return; }
      const seq = ++st.seq;
      box.innerHTML = '<p class="small muted">Calculating…</p>';
      try {
        const qt = await api('/quote', { method: 'POST', body: { kind, item_id: item.id, start: st.start, end: st.end, addons: [...st.addons] } });
        if (seq !== st.seq) return;
        st.quote = qt;
        box.innerHTML = qt.lines.map(l => `<div class="quote-line"><span>${esc(l.label)}</span><span>${money2(l.amount)}</span></div>`).join('')
          + `<div class="quote-line total"><span>Total</span><span>${money2(qt.total)}</span></div>`
          + (qt.deposit ? `<div class="quote-line small muted"><span>Refundable security deposit (due at pickup)</span><span>${money2(qt.deposit)}</span></div>` : '')
          + (qt.available ? '' : `<div class="alert alert-error" style="margin:.75rem 0 0">Not available for these dates. Please pick different dates.</div>`);
        btn.disabled = !qt.available;
      } catch (err) {
        if (seq !== st.seq) return;
        st.quote = null;
        box.innerHTML = `<div class="alert alert-error" style="margin:0">${esc(err.message)}</div>`;
        btn.disabled = true;
      }
      updateBar();
    }

    // On phones and tablets the booking box sits below the details, so keep the price and a button to it in reach.
    // The bar lives inside the page, so it goes away when the visitor navigates elsewhere.
    const bar = document.createElement('div');
    bar.className = 'book-bar';
    bar.innerHTML = '<div class="book-bar-info"><strong></strong><span></span></div><button type="button" class="btn btn-primary"></button>';
    bar.querySelector('button').onclick = () => el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    function updateBar() {
      const qt = st.quote, short = d => fmtDate(d, { month: 'short', day: 'numeric' });
      const [title, sub, btn] = [bar.querySelector('strong'), bar.querySelector('span'), bar.querySelector('button')];
      if (qt?.available && st.start && st.end) {
        title.textContent = `${money2(qt.total)} total`;
        sub.textContent = `${qt.nights} night${qt.nights > 1 ? 's' : ''} · ${short(st.start)} – ${short(st.end)}`;
        btn.textContent = st.step === 'details' ? 'Finish booking' : 'Continue';
      } else {
        title.textContent = `${money(item.nightly_rate)} / night`;
        sub.textContent = qt && !qt.available ? 'Not available for these dates' : 'Add your dates to see the total';
        btn.textContent = 'Check dates';
      }
    }

    function drawDates() {
      el.innerHTML = `
        <div class="price">${money(item.nightly_rate)} <small>/ night</small></div>
        <div class="small muted" style="margin-bottom:1rem">${[item.weekly_rate && money(item.weekly_rate) + ' / week', item.monthly_rate && money(item.monthly_rate) + ' / month', (item.min_nights || 1) + '-night minimum'].filter(Boolean).join(' · ')}</div>
        <div id="cal"></div>
        <div class="date-summary">
          <div><span>${label[0]}</span><strong id="dStart">${st.start ? fmtDate(st.start, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Add date'}</strong></div>
          <div><span>${label[1]}</span><strong id="dEnd">${st.end ? fmtDate(st.end, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Add date'}</strong></div>
        </div>
        <div class="date-meta"><span id="dNights"></span><button type="button" class="link-btn" id="clearDates">Clear dates</button></div>
        <div class="row" style="grid-template-columns:${isRv ? '1fr' : '1fr 1fr'}">
          <div class="field"><label for="guests">Guests</label><select id="guests">${Array.from({ length: maxGuests }, (_, i) => `<option ${i + 1 === st.guests ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></div>
          ${isRv ? '' : `<div class="field"><label for="rigLen">Rig length (ft)</label><input id="rigLen" type="number" min="10" max="80" placeholder="e.g. 32" value="${esc(st.rig_length)}"></div>`}
        </div>
        ${isRv ? '' : `<div class="field"><label for="rigType">Rig type</label><select id="rigType">${['', 'Class A', 'Class B', 'Class C', 'Travel trailer', 'Fifth wheel', 'Toy hauler', 'Pop-up / Tent trailer', 'Truck camper'].map(o => `<option value="${o}" ${o === st.rig_type ? 'selected' : ''}>${o || 'Select…'}</option>`).join('')}</select></div>`}
        <div id="rigWarn"></div>
        ${addons.length ? `<h4 style="font-family:var(--font);font-size:.9rem;margin:.5rem 0 .25rem">Optional add-ons</h4>
          <div>${addons.map(a => `<div class="addon"><label><input type="checkbox" value="${esc(a.id)}" ${st.addons.has(a.id) ? 'checked' : ''}> ${esc(a.name)}</label><span class="small muted">${money(a.price)}${a.per === 'night' ? '/night' : ''}</span></div>`).join('')}</div>` : ''}
        <div class="quote" id="quoteBox"></div>
        <button class="btn btn-primary btn-block" id="continueBtn" style="margin-top:1rem" disabled>Continue to book</button>
        <p class="small muted center" style="margin:.6rem 0 0">${S.payments_enabled ? 'You won’t be charged until you check out securely.' : 'No payment online. We’ll send payment details when we confirm.'}</p>
        ${assurance()}`;
      if (item.status !== 'active') {
        el.innerHTML = `<div class="alert alert-warn">This ${isRv ? 'RV is in for service' : 'site is closed for maintenance'} and can’t be booked right now.</div><a class="btn btn-dark btn-block" href="/${isRv ? 'rentals' : 'sites'}">See other options</a>`;
        return;
      }
      const showDates = () => {
        const n = st.start && st.end ? nightsBetween(st.start, st.end) : 0;
        $('#dNights', el).textContent = n ? `${n} night${n > 1 ? 's' : ''}` : '';
        $('#clearDates', el).hidden = !st.start;
      };
      const cal = calendar($('#cal', el), {
        booked: item.booked, start: st.start, end: st.end, minNights: item.min_nights || 1,
        onChange(s, e) {
          st.start = s; st.end = e;
          $('#dStart', el).textContent = s ? fmtDate(s, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Add date';
          $('#dEnd', el).textContent = e ? fmtDate(e, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Add date';
          showDates();
          keepInUrl();
          refreshQuote();
        }
      });
      $('#clearDates', el).onclick = () => cal.clear();
      showDates();
      $('#guests', el).onchange = ev => { st.guests = Number(ev.target.value); keepInUrl(); };
      const rigCheck = () => {
        const len = Number(st.rig_length);
        $('#rigWarn', el).innerHTML = len > item.max_length ? `<div class="alert alert-error">Site ${esc(item.code)} fits rigs up to ${item.max_length} ft. <a href="/sites?len=${len}">Find a bigger site</a>.</div>` : '';
        return !(len > item.max_length);
      };
      if (!isRv) {
        $('#rigLen', el).oninput = ev => { st.rig_length = ev.target.value; rigCheck(); };
        $('#rigType', el).onchange = ev => { st.rig_type = ev.target.value; };
        rigCheck();
      }
      $$('.addon input', el).forEach(cb => cb.onchange = () => { cb.checked ? st.addons.add(cb.value) : st.addons.delete(cb.value); refreshQuote(); });
      $('#continueBtn', el).onclick = () => {
        if (!isRv && !rigCheck()) return;
        if (st.quote?.available) { st.step = 'details'; drawDetails(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      };
      refreshQuote();
    }

    function drawDetails() {
      const qt = st.quote, guest = savedGuest();
      queueMicrotask(updateBar);
      el.innerHTML = `
        <button class="btn btn-ghost btn-sm" id="backBtn">← Change dates</button>
        <h3 style="margin:1rem 0 .25rem">Your trip</h3>
        <p class="small muted" style="margin:0 0 .75rem">${esc(isRv ? item.name : 'Site ' + item.code)} · ${fmtDate(st.start, { month: 'short', day: 'numeric' })} – ${fmtDate(st.end, { month: 'short', day: 'numeric', year: 'numeric' })} · ${qt.nights} night${qt.nights > 1 ? 's' : ''} · ${st.guests} guest${st.guests > 1 ? 's' : ''}</p>
        <div class="quote-line total" style="margin:0 0 1rem;border:0;padding:0"><span>Total</span><span>${money2(qt.total)}</span></div>
        <form id="bookForm" novalidate>
          <div id="formErr"></div>
          <div class="field"><label for="bName">Full name</label><input id="bName" name="name" autocomplete="name" required value="${esc(guest.name || '')}"></div>
          <div class="field"><label for="bEmail">Email</label><input id="bEmail" name="email" type="email" autocomplete="email" required value="${esc(guest.email || '')}"></div>
          <div class="field"><label for="bPhone">Mobile phone</label><input id="bPhone" name="phone" type="tel" autocomplete="tel" required value="${esc(guest.phone || '')}"></div>
          <div class="field"><label for="bNotes">Notes for our team <span class="muted">(optional)</span></label><textarea id="bNotes" name="notes" placeholder="${isRv ? 'Delivery address, arrival time, questions…' : 'Arrival time, pets, slide-out side…'}">${esc(st.notes || '')}</textarea></div>
          <label class="check field"><input type="checkbox" name="agree" required> <span>I agree to the <a href="/legal/terms" target="_blank">Terms of Service</a> and <a href="/legal/cancellation" target="_blank">Cancellation Policy</a>, and have read the <a href="/legal/privacy" target="_blank">Privacy Policy</a>.${isRv ? ' The driver is 25+ with a valid license.' : ''}</span></label>
          <button class="btn btn-primary btn-block" type="submit">${S.payments_enabled ? `Continue to secure payment · ${money2(qt.total)}` : 'Request booking'}</button>
        </form>`;
      $('#backBtn', el).onclick = () => { st.step = 'dates'; drawDates(); };
      $('#bookForm', el).oninput = ev => {
        const f = formData(ev.currentTarget);
        st.notes = f.notes;
        saveGuest({ name: f.name, email: f.email, phone: f.phone });
      };
      $('#bookForm', el).onsubmit = async ev => {
        ev.preventDefault();
        const f = formData(ev.target);
        const btn = $('button[type=submit]', ev.target);
        btn.disabled = true; btn.textContent = 'Booking…';
        try {
          const res = await api('/bookings', {
            method: 'POST', body: {
              kind, item_id: item.id, start: st.start, end: st.end, guests: st.guests, addons: [...st.addons],
              rig_length: st.rig_length, rig_type: st.rig_type, name: f.name, email: f.email, phone: f.phone, notes: f.notes, agree: !!f.agree
            }
          });
          sessionStorage.setItem('rf_email_' + res.booking.code, res.booking.customer_email);
          if (res.checkout_url) location.href = res.checkout_url;
          else navigate(`/booking/${res.booking.code}?new=1`);
        } catch (err) {
          $('#formErr', el).innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
          btn.disabled = false; btn.textContent = S.payments_enabled ? `Continue to secure payment · ${money2(qt.total)}` : 'Request booking';
        }
      };
    }
    drawDates();
    if (item.status === 'active') {
      updateBar();
      el.closest('.container').appendChild(bar);
      // Hidden while any part of the booking box is on screen.
      new IntersectionObserver(([e]) => bar.classList.toggle('show', !e.isIntersecting)).observe(el);
    }
  }

  // ---------------- pages ----------------
  async function home() {
    const [rvs, saleList, lots, reviewsList, campList] = await Promise.all([api('/rvs'), api('/sales'), api('/lots').catch(() => []), api('/testimonials?limit=6').catch(() => []), api('/campgrounds').catch(() => [])]);
    const locCounts = {};
    for (const r of rvs.filter(r => r.status === 'active')) { const k = R.rvState(r, S); (locCounts[k] ||= { camps: 0, rvs: 0 }).rvs++; }
    for (const c of campList) { const k = R.campState(c); (locCounts[k] ||= { camps: 0, rvs: 0 }).camps++; }
    for (const l of lots.filter(isPrivate)) { const k = R.stateOf(l.campground_location); (locCounts[k] ||= { camps: 0, rvs: 0 }).sites = (locCounts[k].sites || 0) + 1; }
    const homeLocs = R.locationsFrom(S);
    const active = rvs.filter(r => r.status === 'active');
    const featured = (active.filter(r => r.featured).length ? active.filter(r => r.featured) : active).slice(0, 3);
    const lotsForSale = saleList.filter(s => s.category === 'lot' && s.status !== 'sold').slice(0, 3);
    const t = todayStr();
    const title = esc(S.hero_title || '').replace(/(\S+)\.?$/, m => `<em>${m}</em>`);
    app.innerHTML = `
      <section class="hero">
        <div class="hero-bg">${photo('hero-lakeside', 'Motorhome parked on a lakeside campsite at golden hour', { large: true, eager: true })}</div>
        <div class="container"><div class="hero-copy reveal">
          <span class="eyebrow">RV rentals · Campgrounds · RV sales — ${esc(R.regionsLabel(S, true))}</span>
          <h1>${title}</h1>
          <p class="lead">${esc(S.hero_subtitle)}</p>
          <div class="search-card">
            <div class="tabs" role="tablist">
              <button class="active" data-mode="rentals">Rent an RV</button><button data-mode="sites">Book an RV site</button><button data-mode="sales">Buy</button>
            </div>
            <form id="searchForm" class="search-fields"></form>
          </div>
          <div class="hero-stats">
            <div><strong>${active.length}</strong>RVs ready to rent</div>
            <div><strong>${lots.length || '28'}</strong>full-hookup sites</div>
            <div><strong>${R.locationsFrom(S).length || 1}</strong>states: ${esc(R.regionsLabel(S, true))}</div>
            <div><strong>24/7</strong>roadside assistance</div>
          </div>
        </div></div>
      </section>

      <section class="trust"><div class="container">
        <div class="trust-item"><span class="ico">${icon('shield')}</span><div><strong>Inspected & insured</strong>Every unit road-checked before each trip</div></div>
        <div class="trust-item"><span class="ico">${icon('road')}</span><div><strong>Delivery available</strong>We set up at your campground</div></div>
        <div class="trust-item"><span class="ico">${icon('plug')}</span><div><strong>Full hookups</strong>Water, sewer, 30/50 amp & Wi-Fi</div></div>
        <div class="trust-item"><span class="ico">${icon('key')}</span><div><strong>Own your spot</strong>Deeded RV lots & financing</div></div>
      </div></section>

      <section class="block"><div class="container">
        <div class="section-head"><div><span class="eyebrow">Three ways to RV with us</span><h2>Rent it. Park it. Own it.</h2></div>
          <p>One local team for the whole journey — from your first weekend trip to a lot of your own by the lake.</p></div>
        <div class="pillars">
          <a class="pillar" href="/rentals"><div class="art">${photo('class-c-surf', 'Couple relaxing beside their rental motorhome')}</div><span class="num">01</span><div class="body"><h3>RV rentals</h3><p>Motorhomes, camper vans and towables, cleaned and road-checked before every trip.</p><span class="link">Browse the fleet ${icon('arrow').replace('<svg', '<svg width="16" height="16"')}</span></div></a>
          <a class="pillar" href="/sites"><div class="art">${photo('resort-palms', 'RV sites under palm trees at the resort')}</div><span class="num">02</span><div class="body"><h3>RV resort sites</h3><p>Lakefront, pull-through and extended-stay sites by the night, week or month.</p><span class="link">See the park map ${icon('arrow').replace('<svg', '<svg width="16" height="16"')}</span></div></a>
          <a class="pillar" href="/sales"><div class="art">${photo('lot-lake', 'Lakefront land surrounded by palms')}</div><span class="num">03</span><div class="body"><h3>RV & lot sales</h3><p>Inspected new and pre-owned RVs, plus deeded RV lots you can own outright.</p><span class="link">Shop listings ${icon('arrow').replace('<svg', '<svg width="16" height="16"')}</span></div></a>
        </div>
      </div></section>

      <section class="block" style="padding-top:0"><div class="container">
        <div class="section-head"><div><span class="eyebrow">Ready to roll</span><h2>Featured rentals</h2></div><a class="btn btn-ghost" href="/rentals">View all ${active.length} RVs</a></div>
        <div class="grid">${featured.map(r => rvCard(r)).join('')}</div>
      </div></section>

      ${homeLocs.length > 1 ? `<section class="block" style="padding-top:0"><div class="container">
        <div class="section-head"><div><span class="eyebrow">Where we are</span><h2>RV adventures in ${homeLocs.length} states</h2>
          <p>Headquartered in ${esc(homeLocs.find(l => l.hq)?.name || '')}, with RV rentals and campgrounds from the Gulf Coast to the Rockies.</p></div><a class="btn btn-ghost" href="/locations">All locations</a></div>
        <div class="grid loc-grid">${homeLocs.map(l => locationCard(l, locCounts)).join('')}</div>
      </div></section>` : ''}

      <section class="block alt"><div class="container split">
        <div class="split-media">
          <div>${photo('site-palms', 'RVs parked beneath palm trees')}</div>
          <div>${photo('band-sunset', 'Sunset over the lake in Kissimmee')}</div>
          <div>${photo('life-camp', 'Campsite with chairs under an awning')}</div>
        </div>
        <div class="split-copy">
          <span class="eyebrow">STAYCAMPRV campgrounds</span>
          <h2>Everything you need, steps from your site</h2>
          <p class="muted">A gated lakeside resort with level pads, full hookups and the kind of quiet you came for. Stay a night or the whole season.</p>
          <div class="amenities">${(S.amenities || []).slice(0, 8).map(a => `<div class="amenity">${esc(a)}</div>`).join('')}</div>
          <a class="btn btn-dark" href="/sites">Book a site</a>
        </div>
      </div></section>

      ${lotsForSale.length ? `<section class="block"><div class="container">
        <div class="section-head"><div><span class="eyebrow">Own your spot in the sun</span><h2>RV lots for sale</h2></div><a class="btn btn-ghost" href="/sales?category=lot">All lots</a></div>
        <div class="grid">${lotsForSale.map(saleCard).join('')}</div>
      </div></section>` : ''}

      ${reviewsList.length ? `<section class="block alt"><div class="container">
        <div class="section-head"><div><span class="eyebrow">Guest reviews</span><h2>What our guests say</h2></div><a class="btn btn-ghost" href="/reviews">Read all reviews</a></div>
        <div class="testimonials">${reviewsList.map(testimonialCard).join('')}</div>
      </div></section>` : ''}

      <section class="block"${lotsForSale.length && !reviewsList.length ? ' style="padding-top:0"' : ''}><div class="container">
        <div class="section-head"><div><span class="eyebrow">How it works</span><h2>Booking takes about two minutes</h2></div></div>
        <div class="steps">
          <div class="step"><h3>Pick your dates</h3><p class="muted">Live availability calendars show exactly what’s open, with transparent pricing and weekly and monthly discounts.</p></div>
          <div class="step"><h3>Book</h3><p class="muted">Choose add-ons like delivery or a kitchen kit, then confirm. You get a confirmation code right away.</p></div>
          <div class="step"><h3>Hit the road</h3><p class="muted">We walk you through your RV or welcome you at the gate. Check-in is ${esc(S.check_in_time)}, RV pickup is ${esc(S.rv_pickup_time)}.</p></div>
        </div>
      </div></section>

      <section class="block" style="padding-top:0"><div class="container">
        <div class="band photo">${photo('life-couple', '')}<div><span class="eyebrow">Groups & events</span><h2>Planning a rally, a wedding or a film shoot?</h2><p>We handle group site blocks, multi-RV rentals and on-location delivery. Tell us what you need.</p></div>
        <div class="band-actions"><a class="btn btn-primary btn-lg" href="/contact?subject=Group%20booking">Get a group quote</a></div></div>
      </div></section>`;

    const form = $('#searchForm');
    const draw = mode => {
      form.dataset.mode = mode;
      if (mode === 'sales') {
        form.innerHTML = `<div class="field"><label>Looking for</label><select name="category"><option value="">RVs & lots</option><option value="rv">RVs</option><option value="lot">RV lots</option></select></div>
          <div class="field"><label>Max price</label><select name="max"><option value="">Any</option><option value="50000">$50,000</option><option value="100000">$100,000</option><option value="150000">$150,000</option></select></div>
          <div class="field"><label>Condition</label><select name="cond"><option value="">Any</option><option>New</option><option>Used</option><option>Certified Pre-Owned</option><option>Deeded</option></select></div>
          <button class="btn btn-primary">Search</button>`;
      } else {
        form.innerHTML = `<div class="field"><label>${mode === 'rentals' ? 'Pickup' : 'Check-in'}</label><input type="date" name="start" min="${t}" required></div>
          <div class="field"><label>${mode === 'rentals' ? 'Return' : 'Check-out'}</label><input type="date" name="end" min="${addDays(t, 1)}" required></div>
          ${mode === 'rentals' ? '<div class="field"><label>Guests</label><select name="sleeps">' + [1, 2, 4, 6, 8].map(n => `<option value="${n}">${n}+</option>`).join('') + '</select></div>'
            : '<div class="field"><label>Rig length (ft)</label><input type="number" name="len" min="10" max="80" placeholder="Any"></div>'}
          <button class="btn btn-primary">Search</button>`;
        form.start.onchange = () => { form.end.min = addDays(form.start.value, 1); if (form.end.value <= form.start.value) form.end.value = addDays(form.start.value, mode === 'rentals' ? 3 : 2); };
      }
    };
    $$('.tabs button').forEach(b => b.onclick = () => { $$('.tabs button').forEach(x => x.classList.toggle('active', x === b)); draw(b.dataset.mode); });
    form.onsubmit = ev => {
      ev.preventDefault();
      const mode = form.dataset.mode, f = formData(form);
      if (mode !== 'sales' && f.start && f.end && f.end <= f.start) return toast('Check-out must be after check-in.', true);
      navigate(`/${mode}${qsOf(f)}`);
    };
    draw('rentals');
  }

  async function rentals(_, q) {
    const dated = isDate(q.start) && isDate(q.end) && q.end > q.start;
    let list = await api('/rvs' + (dated ? qsOf({ start: q.start, end: q.end }) : ''));
    const types = [...new Set(list.map(r => r.type))].sort();
    if (q.type) list = list.filter(r => r.type === q.type);
    if (q.sleeps) list = list.filter(r => r.sleeps >= Number(q.sleeps));
    const pickupStates = [...new Set((await api('/rvs')).map(r => R.rvState(r, S)).filter(Boolean))];
    if (q.state) list = list.filter(r => R.rvState(r, S) === q.state);
    const sort = q.sort || 'featured';
    if (sort === 'price') list.sort((a, b) => a.nightly_rate - b.nightly_rate);
    if (sort === 'price-desc') list.sort((a, b) => b.nightly_rate - a.nightly_rate);
    if (sort === 'sleeps') list.sort((a, b) => b.sleeps - a.sleeps);
    list.sort((a, b) => Number(b.available) - Number(a.available));
    const t = todayStr();
    app.innerHTML = `${banner('RV rentals', `Find your road trip RV`, `Every rental includes a hands-on walkthrough, 24/7 roadside assistance, a fresh water fill and a dump kit. Weekly rates apply automatically.`, 'class-c-camp')}<div class="container">
      <form class="filters" id="filters">
        <div class="field"><label>Pickup</label><input type="date" name="start" min="${t}" value="${esc(q.start || '')}"></div>
        <div class="field"><label>Return</label><input type="date" name="end" min="${esc(q.start ? addDays(q.start, 1) : addDays(t, 1))}" value="${esc(q.end || '')}"></div>
        <div class="field"><label>Type</label><select name="type"><option value="">All types</option>${types.map(x => `<option ${x === q.type ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        ${pickupStates.length > 1 ? `<div class="field"><label>Pickup in</label><select name="state"><option value="">All states</option>${pickupStates.map(c => `<option value="${c}" ${c === q.state ? 'selected' : ''}>${esc(R.STATES[c])}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label>Sleeps</label><select name="sleeps"><option value="">Any</option>${[2, 4, 6, 8].map(n => `<option value="${n}" ${String(n) === q.sleeps ? 'selected' : ''}>${n}+</option>`).join('')}</select></div>
        <div class="field"><label>Sort</label><select name="sort">${[['featured', 'Recommended'], ['price', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['sleeps', 'Most sleeping space']].map(([v, l]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <button type="button" class="btn btn-ghost" id="clearF">Clear</button>
      </form>
      <p class="result-count">${dated
        ? `<strong>${list.filter(r => r.available).length}</strong> of ${list.length} RV${list.length === 1 ? '' : 's'} available for <strong>${fmtDate(q.start)}</strong> → <strong>${fmtDate(q.end)}</strong>`
        : `<strong>${list.length}</strong> RV${list.length === 1 ? '' : 's'}${q.type || q.sleeps || q.state ? ' match your filters' : ' to choose from'} · add dates to check availability`}</p>
      ${list.length ? `<div class="grid">${list.map(r => rvCard(r, dated ? q : {})).join('')}</div>` : '<div class="empty"><h3>No RVs match those filters</h3><p>Try a different type or fewer guests.</p></div>'}
      <div style="height:3rem"></div></div>`;
    const f = $('#filters');
    f.onchange = ev => {
      const d = formData(f);
      if (ev.target.name === 'start' && d.start && (!d.end || d.end <= d.start)) d.end = addDays(d.start, 3);
      if (d.start && d.end && d.end <= d.start) { toast('Return must be after pickup.', true); return; }
      navigate('/rentals' + qsOf(d));
    };
    $('#clearF').onclick = () => { navigate('/rentals'); };
  }

  async function rvDetail([id], q) {
    const rv = await api('/rvs/' + id);
    const gal = gallery('rv', rv);
    const specs = [['Type', rv.type], ['Sleeps', rv.sleeps], ['Length', rv.length_ft && rv.length_ft + ' ft'], ['Year', rv.year], ['Make', rv.make], ['Model', rv.model],
      ['Pickup location', rv.pickup_location || [R.locationsFrom(S).find(l => l.hq)?.city, R.hqCode(S)].filter(Boolean).join(', ')],
      ['Miles included', rv.miles_per_night ? rv.miles_per_night + ' / night' : 'Towable / delivered'], ['Security deposit', money(rv.deposit)]].filter(x => x[1]);
    app.innerHTML = `<div class="container">
      <div class="crumbs"><a href="/rentals">RV rentals</a> / ${esc(rv.name)}</div>
      <div class="detail">
        <div>
          ${gal.html}
          <div class="detail-title"><span class="eyebrow">${esc(rv.type)}</span><h1>${esc(rv.name)}</h1>
            <p class="muted" style="font-size:1.05rem">${esc([rv.year, rv.make, rv.model].filter(Boolean).join(' '))}</p></div>
          <div class="spec-grid">${specs.map(([k, v]) => `<div class="spec"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>
          <h3>About this RV</h3>${paras(rv.description)}
          ${rv.features?.length ? `<h3>Features</h3><ul class="feature-list">${rv.features.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          <h3>Good to know</h3>
          <div class="policy"><strong>Pickup & return.</strong> Pickup is at ${esc(S.rv_pickup_time)} and return by ${esc(S.rv_return_time)}. ${esc(S.rental_policy)}</div>
          <div class="policy"><strong>Cancellation.</strong> ${esc(S.cancellation_policy)}</div>
        </div>
        <aside><div class="panel book sticky" id="bookPanel"></div></aside>
      </div></div>`;
    gal.bind(app);
    bookingWidget($('#bookPanel'), 'rv', rv, q);
  }

  // ---------------- RV sites & campgrounds ----------------
  const tileState = (l, len) => l.status !== 'active' ? 'maint' : len && l.max_length < len ? 'toosmall' : !l.available ? 'booked' : 'avail';
  const stayQs = (q, extra = {}) => qsOf({ start: isDate(q.start) && isDate(q.end) && q.end > q.start ? q.start : '', end: isDate(q.start) && isDate(q.end) && q.end > q.start ? q.end : '', len: q.len, ...extra });
  const isPrivate = l => !l.campground_id;   // a standalone site, not part of a campground
  function lotCard(l, q = {}) {
    const st = tileState(l, Number(q.len) || 0), dated = isDate(q.start) && isDate(q.end);
    const badge = { maint: '<span class="badge warn">Closed for maintenance</span>', toosmall: `<span class="badge gray">Fits up to ${l.max_length} ft</span>`, booked: `<span class="badge gray">${dated ? 'Booked for your dates' : 'Occupied tonight'}</span>`, avail: '' }[st];
    return `<a class="card ${st === 'avail' ? '' : 'unavailable'}" href="/sites/${l.id}${stayQs(q)}">${badge}
      <div class="media">${art('lot', l)}</div>
      <div class="content">
        <span class="eyebrow">${l.campground_name ? `${esc(l.campground_name)} · ${esc(l.section)}` : 'Private RV site'}</span>
        <h3>${l.campground_name ? `Site ${esc(l.code)}` : esc(l.name || `Site ${l.code}`)}</h3>
        ${l.campground_location ? `<div class="meta">${esc(l.campground_location)}</div>` : ''}
        <div class="specs"><span class="chip">${esc(l.site_type)}</span><span class="chip">Up to ${esc(l.max_length)} ft</span><span class="chip">${esc(l.amps)} amp</span>${l.min_nights > 1 ? `<span class="chip">${l.min_nights}-night min</span>` : ''}</div>
        <div class="price-row"><div class="price">${money(l.nightly_rate)} <small>/ night</small></div><span class="small muted">${l.monthly_rate ? money(l.monthly_rate) + '/mo' : l.weekly_rate ? money(l.weekly_rate) + '/wk' : ''}</span></div>
      </div></a>`;
  }
  function campCard(c, q = {}) {
    const dated = isDate(q.start) && isDate(q.end) && q.end > q.start;
    return `<a class="card camp-card" href="/sites/park/${c.id}${stayQs(q)}">${c.featured ? '<span class="badge sun">Featured</span>' : ''}
      <div class="media">${art('camp', c)}</div>
      <div class="content">
        <span class="eyebrow">${esc(c.location || '')}</span>
        <h3>${esc(c.name)}</h3>
        ${c.description ? `<p class="small muted camp-desc">${esc(c.description)}</p>` : ''}
        <div class="specs"><span class="chip">${c.pad_count} site${c.pad_count === 1 ? '' : 's'}</span>${c.max_length ? `<span class="chip">Up to ${c.max_length} ft</span>` : ''}<span class="chip ${c.available_count ? 'chip-ok' : ''}">${c.available_count} open ${dated ? 'for your dates' : 'tonight'}</span></div>
        <div class="price-row"><div class="price">${c.from_rate != null ? `<small>from</small> ${money(c.from_rate)} <small>/ night</small>` : '<small>Coming soon</small>'}</div><span class="small muted">${c.monthly_from ? 'from ' + money(c.monthly_from) + '/mo' : ''}</span></div>
      </div></a>`;
  }
  function siteFilters(q, { camps = [], sections = [], states = [] } = {}) {
    const t = todayStr();
    return `<form class="filters" id="filters">
      <div class="field"><label>Check-in</label><input type="date" name="start" min="${t}" value="${esc(q.start || '')}"></div>
      <div class="field"><label>Check-out</label><input type="date" name="end" min="${esc(q.start ? addDays(q.start, 1) : addDays(t, 1))}" value="${esc(q.end || '')}"></div>
      <div class="field"><label>Rig length (ft)</label><input type="number" name="len" min="10" max="80" placeholder="Any" value="${esc(q.len || '')}"></div>
      ${states.length > 1 ? `<div class="field"><label>State</label><select name="state"><option value="">All states</option>${states.map(c => `<option value="${c}" ${c === q.state ? 'selected' : ''}>${esc(R.STATES[c])}</option>`).join('')}</select></div>` : ''}
      ${camps.length > 1 ? `<div class="field"><label>Campground</label><select name="campground"><option value="">All campgrounds</option>${camps.map(c => `<option value="${c.id}" ${String(c.id) === q.campground ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}
      ${sections.length > 1 ? `<div class="field"><label>Section</label><select name="section"><option value="">All sections</option>${sections.map(s => `<option ${s === q.section ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>Sort</label><select name="sort">${[['', 'Recommended'], ['price', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['length', 'Longest sites']].map(([v, l]) => `<option value="${v}" ${v === (q.sort || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <button type="button" class="btn btn-ghost" id="clearF">Clear</button>
    </form>`;
  }
  function bindSiteFilters(base) {
    const f = $('#filters');
    f.onchange = ev => {
      const d = formData(f);
      if (ev.target.name === 'start' && d.start && (!d.end || d.end <= d.start)) d.end = addDays(d.start, 2);
      if (d.start && d.end && d.end <= d.start) { toast('Check-out must be after check-in.', true); return; }
      navigate(base + qsOf(d));
    };
    $('#clearF').onclick = () => { navigate(base); };
  }
  function sortLots(list, q) {
    const len = Number(q.len) || 0;
    const out = [...list];
    if (q.sort === 'price') out.sort((a, b) => a.nightly_rate - b.nightly_rate);
    if (q.sort === 'price-desc') out.sort((a, b) => b.nightly_rate - a.nightly_rate);
    if (q.sort === 'length') out.sort((a, b) => b.max_length - a.max_length);
    return out.sort((a, b) => Number(tileState(b, len) === 'avail') - Number(tileState(a, len) === 'avail'));
  }

  async function sites(_, q) {
    const dated = isDate(q.start) && isDate(q.end) && q.end > q.start;
    const dq = dated ? { start: q.start, end: q.end } : {};
    const [camps, lots] = await Promise.all([api('/campgrounds' + qsOf(dq)), api('/lots' + qsOf({ ...dq, campground: q.campground }))]);
    const len = Number(q.len) || 0;
    const campStates = [...new Set([...camps.map(c => R.campState(c)), ...lots.filter(isPrivate).map(l => R.stateOf(l.campground_location))].filter(Boolean))];
    const inState = l => !q.state || R.stateOf(l.campground_location) === q.state;
    const list = sortLots(lots.filter(inState), q);
    const open = list.filter(l => tileState(l, len) === 'avail');
    app.innerHTML = `${banner('RV sites & campgrounds', 'Find your spot', `Full-hookup RV sites at ${camps.length > 1 ? `${camps.length} campgrounds` : 'our campground'} across ${esc(R.regionsLabel(S))}, by the night, week or month. Every pad lists its own size, hookups and price. Check-in ${esc(S.check_in_time)} · Check-out ${esc(S.check_out_time)}.`, 'site-aerial-b')}
      <div class="container">
      ${siteFilters(q, { camps, states: campStates })}
      ${camps.length ? `<div class="section-head" style="margin-top:2rem"><div><span class="eyebrow">Our campgrounds</span><h2>Choose a campground</h2></div></div>
        <div class="grid">${camps.filter(c => (!q.campground || String(c.id) === q.campground) && (!q.state || R.campState(c) === q.state)).map(c => campCard(c, q)).join('')}</div>` : ''}
      <div class="section-head" style="margin-top:3rem"><div><span class="eyebrow">Sites & pads</span><h2>${q.campground ? esc(camps.find(c => String(c.id) === q.campground)?.name || 'Sites') : 'All RV sites'}</h2>
        <p><strong>${open.length}</strong> of ${list.length} sites available ${dated ? `for <strong>${fmtDate(q.start)}</strong> → <strong>${fmtDate(q.end)}</strong>` : 'tonight'}${len ? ` for a ${len} ft rig` : ''}.</p></div></div>
      ${list.length ? `<div class="grid" id="lotGrid">${list.map((l, i) => lotCard(l, q).replace('<a class="card', `<a class="card${i >= 12 ? ' hidden' : ''}`)).join('')}</div>
        ${list.length > 12 ? `<div class="center" style="margin-top:1.75rem"><button class="btn btn-ghost" id="moreLots">Show all ${list.length} sites</button></div>` : ''}` : '<div class="empty"><h3>No sites match</h3><p>Try different dates or a shorter rig length.</p></div>'}
      <div style="height:3rem"></div></div>`;
    bindSiteFilters('/sites');
    const more = $('#moreLots');
    if (more) more.onclick = () => { $$('#lotGrid .card.hidden').forEach(c => c.classList.remove('hidden')); more.remove(); };
  }

  async function campground([id], q) {
    const dated = isDate(q.start) && isDate(q.end) && q.end > q.start;
    const c = await api(`/campgrounds/${id}` + qsOf(dated ? { start: q.start, end: q.end } : {}));
    const len = Number(q.len) || 0;
    const visible = sortLots(q.section ? c.lots.filter(l => l.section === q.section) : c.lots, q);
    const open = visible.filter(l => tileState(l, len) === 'avail');
    const bySection = {};
    [...visible].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })).forEach(l => (bySection[l.section] ||= []).push(l));
    const amen = c.amenities?.length ? c.amenities : (S.amenities || []);
    app.innerHTML = `<section class="page-banner">${art('camp', c, { large: true, eager: true })}
        <div class="container"><span class="eyebrow">${esc(c.location || 'Campground')}</span><h1>${esc(c.name)}</h1>
        <p>${c.pad_count} RV sites · ${c.from_rate != null ? `from ${money(c.from_rate)}/night` : ''}${c.monthly_from ? ` · from ${money(c.monthly_from)}/month` : ''}</p></div></section>
      <div class="container">
      <div class="crumbs"><a href="/sites">RV sites</a> / ${esc(c.name)}</div>
      <div class="camp-intro">
        <div>${c.description ? `<p class="lead-text">${esc(c.description)}</p>` : ''}
          ${c.features?.length ? `<ul class="feature-list">${c.features.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>
        <aside class="panel"><h3 style="margin-top:0">Amenities</h3><div class="amenities" style="grid-template-columns:1fr">${amen.map(a => `<div class="amenity">${esc(a)}</div>`).join('')}</div>
          ${c.address ? `<p class="small muted" style="margin:1rem 0 0">${esc(c.address)} · <a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}">Map</a></p>` : ''}</aside>
      </div>
      ${siteFilters(q, { sections: c.sections })}
      <p><strong>${open.length}</strong> of ${visible.length} sites available ${dated ? `for <strong>${fmtDate(q.start)}</strong> → <strong>${fmtDate(q.end)}</strong>` : 'tonight'}${len ? ` for a ${len} ft rig` : ''}. Tap a site to book it.</p>
      ${visible.length ? `<div class="park-map">
        <div class="map-title">${esc(c.name)}</div>
        ${Object.entries(bySection).map(([sec, ls]) => `<div class="map-section"><h4>${esc(sec)}</h4><div class="map-row">
          ${ls.map(l => { const s = tileState(l, len); return `<a class="site-tile ${s}" href="/sites/${l.id}${stayQs(q)}" title="${esc(l.site_type)} · up to ${l.max_length} ft · ${esc(l.amps)} amp">${esc(l.code)}<small>${s === 'avail' ? money(l.nightly_rate) : s === 'booked' ? 'Booked' : s === 'maint' ? 'Closed' : 'Too short'}</small></a>`; }).join('')}
        </div></div>`).join('')}
        ${amen.length ? `<div class="map-office">${amen.slice(0, 4).map(esc).join(' · ')}</div>` : ''}
        <div class="map-legend"><span><i style="background:var(--palm-2)"></i>Available</span><span><i style="background:#c9c3b8"></i>Booked</span><span><i style="background:#f3d6a4"></i>Maintenance</span><span><i style="background:#e9e5de"></i>Too short for your rig</span></div>
      </div>
      <h2>Sites & rates</h2>
      <div class="grid">${visible.map(l => lotCard(l, q)).join('')}</div>` : '<div class="empty"><h3>No sites listed yet</h3><p>Check back soon, or <a href="/contact">contact us</a> to reserve.</p></div>'}
      <div style="height:3rem"></div></div>`;
    bindSiteFilters(`/sites/park/${c.id}`);
  }

  async function siteDetail([id], q) {
    const lot = await api('/lots/' + id);
    const gal = gallery('lot', lot);
    const camp = lot.campground || {}, standalone = !lot.campground;
    const title = standalone ? (lot.name || `RV Site ${lot.code}`) : `RV Site ${lot.code}`;
    const where = camp.location || lot.location, address = camp.address || lot.address;
    const hook = [lot.water && 'Water', lot.sewer && 'Sewer', lot.amps + ' amp electric', lot.wifi && 'Wi-Fi'].filter(Boolean).join(' · ');
    const specs = [['Campground', camp.name], ['Location', where], ['Section', standalone ? '' : lot.section], ['Site type', lot.site_type], ['Max rig length', lot.max_length + ' ft'], ['Hookups', hook],
      ['Weekly', lot.weekly_rate && money(lot.weekly_rate)], ['Monthly', lot.monthly_rate && money(lot.monthly_rate)]].filter(x => x[1]);
    // Standalone sites list their own amenities; campground sites show the campground's (or the resort's).
    const amen = standalone ? (lot.amenities || []) : camp.amenities?.length ? camp.amenities : (S.amenities || []);
    app.innerHTML = `<div class="container">
      <div class="crumbs"><a href="/sites">RV sites</a> / ${camp.id ? `<a href="/sites/park/${camp.id}${stayQs(q)}">${esc(camp.name)}</a> / ` : ''}${esc(standalone ? title : `Site ${lot.code}`)}</div>
      <div class="detail">
        <div>
          ${gal.html}
          <div class="detail-title"><span class="eyebrow">${standalone ? 'Private RV site' : `${esc(camp.name || '')} · ${esc(lot.section)}`}</span><h1>${esc(title)}</h1>
            ${where ? `<p class="muted" style="font-size:1.05rem">${esc(where)}</p>` : ''}</div>
          <div class="spec-grid">${specs.map(([k, v]) => `<div class="spec"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>
          <h3>About this site</h3>${paras(lot.description)}
          ${lot.features?.length ? `<ul class="feature-list">${lot.features.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          ${camp.description ? `<h3>About ${esc(camp.name)}</h3>${paras(camp.description)}` : ''}
          ${amen.length ? `<h3>${standalone ? 'Amenities' : 'Campground amenities'}</h3><ul class="feature-list">${amen.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
          ${address ? `<p class="small muted">${esc(address)} · <a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}">Open in Maps</a></p>` : ''}
          <div class="policy"><strong>${standalone ? 'Site rules.' : 'Park rules.'}</strong> Check-in ${esc(S.check_in_time)}, check-out ${esc(S.check_out_time)}. ${esc(S.site_policy)}</div>
          <div class="policy"><strong>Cancellation.</strong> ${esc(S.cancellation_policy)}</div>
          ${camp.id ? `<a class="btn btn-ghost" href="/sites/park/${camp.id}${stayQs(q)}">See all sites at ${esc(camp.name)}</a>` : ''}
        </div>
        <aside><div class="panel book sticky" id="bookPanel"></div></aside>
      </div></div>`;
    gal.bind(app);
    bookingWidget($('#bookPanel'), 'lot', lot, q);
  }

  async function sales(_, q) {
    let list = await api('/sales');
    const cat = q.category || '';
    if (cat) list = list.filter(s => s.category === cat);
    if (q.max) list = list.filter(s => s.price <= Number(q.max));
    if (q.cond) list = list.filter(s => s.condition === q.cond);
    if (q.sort === 'price') list.sort((a, b) => a.price - b.price);
    if (q.sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    if (q.sort === 'year') list.sort((a, b) => (b.year || 0) - (a.year || 0));
    app.innerHTML = `${banner('RV & RV lot sales', `${cat === 'lot' ? 'RV lots for sale' : cat === 'rv' ? 'RVs for sale' : 'Own your next adventure'}`, `Every pre-owned RV passes a 120-point inspection by our service team. Deeded RV lots at STAYCAMPRV Shores include HOA amenities and are eligible for our rental program.`, cat === 'lot' ? 'lot-lake' : 'class-a-road')}<div class="container">
      <div class="tabs" id="catTabs">${[['', 'All listings'], ['rv', 'RVs'], ['lot', 'RV lots']].map(([v, l]) => `<button data-cat="${v}" class="${v === cat ? 'active' : ''}">${l}</button>`).join('')}</div>
      <form class="filters" id="filters">
        <div class="field"><label>Max price</label><select name="max"><option value="">Any price</option>${[50000, 75000, 100000, 125000, 150000, 250000].map(v => `<option value="${v}" ${String(v) === q.max ? 'selected' : ''}>${money(v)}</option>`).join('')}</select></div>
        <div class="field"><label>Condition</label><select name="cond"><option value="">Any</option>${['New', 'Used', 'Certified Pre-Owned', 'Deeded', 'Leasehold'].map(v => `<option ${v === q.cond ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>Sort</label><select name="sort">${[['', 'Featured'], ['price', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['year', 'Newest year']].map(([v, l]) => `<option value="${v}" ${v === (q.sort || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </form>
      ${list.length ? `<div class="grid">${list.map(saleCard).join('')}</div>` : '<div class="empty"><h3>No listings match</h3><p>New inventory arrives every week — <a href="/contact">tell us what you’re looking for</a>.</p></div>'}
      <div style="height:2rem"></div>
      <div class="band"><div><h2>Selling your RV?</h2><p>We buy RVs outright, take trade-ins and offer consignment with professional photos and listings.</p></div><a class="btn btn-primary" href="/contact?subject=Sell%20my%20RV">Get an offer</a></div>
      <div style="height:3rem"></div></div>`;
    $$('#catTabs button').forEach(b => b.onclick = () => { navigate('/sales' + qsOf({ ...formData($('#filters')), category: b.dataset.cat })); });
    $('#filters').onchange = () => { navigate('/sales' + qsOf({ ...formData($('#filters')), category: cat })); };
  }

  async function saleDetail([id]) {
    const s = await api('/sales/' + id);
    const gal = gallery('sale', s);
    const isLot = s.category === 'lot';
    const specs = (isLot
      ? [['Lot size', s.lot_size], ['Location', s.location], ['Ownership', s.condition]]
      : [['Type', s.type], ['Year', s.year], ['Make', s.make], ['Model', s.model], ['Length', s.length_ft && s.length_ft + ' ft'],
        ['Mileage', s.mileage != null && Number(s.mileage).toLocaleString() + ' mi'], ['Sleeps', s.sleeps], ['Condition', s.condition]]).filter(x => x[1]);
    const sold = s.status === 'sold';
    app.innerHTML = `<div class="container">
      <div class="crumbs"><a href="/sales">For sale</a> / <a href="/sales?category=${esc(s.category)}">${isLot ? 'RV lots' : 'RVs'}</a> / ${esc(s.title)}</div>
      <div class="detail">
        <div>
          ${gal.html}
          <div class="detail-title"><span class="eyebrow">${esc(s.type || '')}</span><h1>${esc(s.title)}</h1>
            <div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap"><span class="price" style="font-size:2rem">${money(s.price)}</span>${statusPill(s.status)}</div></div>
          <div class="spec-grid">${specs.map(([k, v]) => `<div class="spec"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>
          <h3>Description</h3>${paras(s.description)}
          ${s.features?.length ? `<h3>Highlights</h3><ul class="feature-list">${s.features.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          <div class="panel" style="margin-bottom:2rem">
            <h3>Payment estimator</h3>
            <form id="calc" class="row">
              <div class="field"><label>Price</label><input name="price" type="number" min="0" value="${s.price}"></div>
              <div class="field"><label>Down payment (%)</label><input name="down" type="number" min="0" max="100" value="20"></div>
              <div class="field"><label>APR (%)</label><input name="apr" type="number" min="0" max="30" step="0.01" value="${isLot ? '8.49' : '7.99'}"></div>
              <div class="field"><label>Term</label><select name="years">${[5, 10, 12, 15, 20].map(y => `<option value="${y}" ${y === 15 ? 'selected' : ''}>${y} years</option>`).join('')}</select></div>
            </form>
            <div id="calcOut"></div>
            <p class="small muted" style="margin:0">Estimate only. Not a credit offer; rates depend on credit approval and lender terms.</p>
          </div>
        </div>
        <aside><div class="panel book sticky">
          ${sold ? '<div class="alert alert-warn">This listing has sold. Ask us to find you something similar.</div>' : s.status === 'pending' ? '<div class="alert alert-warn">A sale is pending. You can still send a backup offer.</div>' : ''}
          <h3>Interested?</h3>
          <div class="tabs" id="iqTabs">${[['info', 'Ask'], ['tour', 'Tour'], ['offer', 'Offer'], ['financing', 'Finance']].map(([v, l], i) => `<button type="button" data-k="${v}" class="${i === 0 ? 'active' : ''}">${l}</button>`).join('')}</div>
          <form id="iqForm" novalidate>
            <div id="iqMsg"></div>
            <input type="hidden" name="kind" value="info">
            <div class="field"><label>Name</label><input name="name" autocomplete="name" required></div>
            <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required></div>
            <div class="field"><label>Phone</label><input name="phone" type="tel" autocomplete="tel"></div>
            <div class="field hidden" data-for="offer"><label>Your offer ($)</label><input name="offer_amount" type="number" min="1" placeholder="${Math.round(s.price * 0.95)}"></div>
            <div class="field hidden" data-for="tour"><label>Preferred date</label><input name="preferred_date" type="date" min="${todayStr()}"></div>
            <div class="field"><label>Message</label><textarea name="message" placeholder="Questions, trade-in details, timeline…"></textarea></div>
            <button class="btn btn-primary btn-block">Send</button>
          </form>
          <p class="small muted center" style="margin:.75rem 0 0">Or email <a href="mailto:${esc(S.email)}">${esc(S.email)}</a></p>
        </div></aside>
      </div></div>`;
    gal.bind(app);
    const calc = $('#calc');
    const runCalc = () => {
      const f = formData(calc);
      const principal = Number(f.price) * (1 - Number(f.down) / 100);
      const m = loanPayment(principal, Number(f.apr), Number(f.years));
      $('#calcOut').innerHTML = `<div class="quote-line total" style="border:0;margin:0 0 .5rem"><span>Estimated monthly payment</span><span>${money2(m)}</span></div>
        <div class="quote-line small muted"><span>Amount financed</span><span>${money2(principal)}</span></div>
        <div class="quote-line small muted" style="margin-bottom:.75rem"><span>Total interest</span><span>${money2(m * Number(f.years) * 12 - principal)}</span></div>`;
    };
    calc.oninput = runCalc; runCalc();
    const form = $('#iqForm');
    $$('#iqTabs button').forEach(b => b.onclick = () => {
      $$('#iqTabs button').forEach(x => x.classList.toggle('active', x === b));
      form.kind.value = b.dataset.k;
      $$('[data-for]', form).forEach(x => x.classList.toggle('hidden', x.dataset.for !== b.dataset.k));
      form.message.placeholder = { info: 'Questions, trade-in details, timeline…', tour: 'Who is coming and what time works best?', offer: 'Any conditions on your offer?', financing: 'Estimated credit range, down payment, trade-in…' }[b.dataset.k];
    });
    form.onsubmit = async ev => {
      ev.preventDefault();
      const btn = $('button', form);
      btn.disabled = true;
      try {
        await api('/inquiries', { method: 'POST', body: { ...formData(form), listing_id: s.id } });
        form.reset(); form.kind.value = 'info';
        $('#iqMsg').innerHTML = '<div class="alert alert-ok">Thanks! Our sales team will reach out within one business day.</div>';
      } catch (err) { $('#iqMsg').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`; }
      btn.disabled = false;
    };
  }

  async function bookingView([code], q) {
    code = code.toUpperCase();
    const email = q.email || sessionStorage.getItem('rf_email_' + code);
    if (!email) { navigate('/manage' + qsOf({ code })); return; }
    let payNote = '';
    if (q.paid && q.session_id && S.payments_enabled) {
      try { const v = await api('/payments/verify' + qsOf({ session_id: q.session_id })); payNote = v.paid ? '<div class="alert alert-ok">Payment received — thank you! Your booking is confirmed.</div>' : '<div class="alert alert-warn">Your payment is still processing. Refresh in a minute.</div>'; }
      catch (e) { payNote = `<div class="alert alert-warn">${esc(e.message)}</div>`; }
    }
    if (q.cancelled_payment) payNote = '<div class="alert alert-warn">Payment was not completed. Your booking is held as pending — you can pay below or at check-in.</div>';
    let b;
    try { b = await api(`/bookings/${encodeURIComponent(code)}${qsOf({ email })}`); }
    catch (e) { sessionStorage.removeItem('rf_email_' + code); navigate('/manage' + qsOf({ code, err: 1 })); return; }
    sessionStorage.setItem('rf_email_' + code, email);
    const isRv = b.kind === 'rv';
    const canCancel = ['pending', 'confirmed'].includes(b.status) && b.start_date > todayStr();
    const balance = Math.max(0, b.total - b.amount_paid);
    const next = {
      pending: S.payments_enabled && b.payment_status !== 'paid' ? 'Your dates are held. Complete payment to confirm, or our team will contact you within a few hours.'
        : `Your request is in! Our team will review it and confirm by email within a few business hours.${b.hold_until ? ` Your dates are held until ${fmtDate(b.hold_until)}: please pay or reply to our email by then to keep them.` : ''}`,
      confirmed: `You’re all set. ${isRv ? `Pickup is at ${S.rv_pickup_time} on ${fmtDate(b.start_date)} at ${S.address}. Bring your driver’s license, proof of insurance, and the security deposit.` : `Check-in begins at ${S.check_in_time}. Head to the office when you arrive and we’ll guide you to site ${b.item?.code || ''}.`}`,
      checked_in: 'Enjoy your stay! Message us anytime if you need anything.',
      completed: 'Thanks for traveling with STAYCAMPRV. We hope to see you again soon!',
      cancelled: 'This booking has been cancelled. Any refund due is processed according to our cancellation policy within 5–7 business days.'
    }[b.status];
    app.innerHTML = `<div class="container" style="max-width:860px">
      <div class="confirm-hero">
        ${q.new ? '<span class="eyebrow">Booking received</span><h1>You’re on your way!</h1>' : '<span class="eyebrow">Your booking</span><h1>Trip details</h1>'}
        <p class="muted">Confirmation code</p><div class="confirm-code">${esc(b.code)}</div>
        <p style="margin-top:1rem">${statusPill(b.status)} ${statusPill(b.payment_status)}</p>
      </div>
      ${payNote}
      <div class="alert ${b.status === 'cancelled' ? 'alert-warn' : 'alert-ok'}">${esc(next)}</div>
      <div class="panel" style="margin-bottom:1.25rem">
        <div style="display:grid;grid-template-columns:160px 1fr;gap:1.25rem;align-items:center">
          <div class="detail-media" style="border-radius:14px;box-shadow:none">${art(b.kind, b.item)}</div>
          <div><span class="eyebrow">${isRv ? 'RV rental' : 'RV site'}</span><h2 style="margin:0">${esc(b.item_name)}</h2>
            <p class="muted" style="margin:0">${isRv ? esc(b.item?.type || '') : esc(b.item?.section || '')}</p></div>
        </div>
      </div>
      <div class="row" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start">
        <div class="panel"><h3>Details</h3><dl class="dl">
          <dt>${isRv ? 'Pickup' : 'Check-in'}</dt><dd>${fmtDate(b.start_date)} · ${esc(isRv ? S.rv_pickup_time : S.check_in_time)}</dd>
          <dt>${isRv ? 'Return' : 'Check-out'}</dt><dd>${fmtDate(b.end_date)} · ${esc(isRv ? S.rv_return_time : S.check_out_time)}</dd>
          <dt>Nights</dt><dd>${b.nights}</dd><dt>Guests</dt><dd>${b.guests}</dd>
          ${b.rig_info ? `<dt>Rig</dt><dd>${esc(b.rig_info)}</dd>` : ''}
          <dt>Name</dt><dd>${esc(b.customer_name)}</dd><dt>Email</dt><dd>${esc(b.customer_email)}</dd><dt>Phone</dt><dd>${esc(b.customer_phone || '—')}</dd>
          ${b.notes ? `<dt>Notes</dt><dd>${esc(b.notes)}</dd>` : ''}
        </dl></div>
        <div class="panel"><h3>Price</h3>
          <div class="quote-line"><span>${b.nights} night${b.nights > 1 ? 's' : ''}</span><span>${money2(b.base)}</span></div>
          ${(b.addons || []).map(a => `<div class="quote-line"><span>${esc(a.name)}</span><span>${money2(a.amount)}</span></div>`).join('')}
          ${b.fees ? `<div class="quote-line"><span>Cleaning & prep fee</span><span>${money2(b.fees)}</span></div>` : ''}
          <div class="quote-line"><span>Taxes</span><span>${money2(b.tax)}</span></div>
          <div class="quote-line total"><span>Total</span><span>${money2(b.total)}</span></div>
          <div class="quote-line"><span>Paid</span><span>${money2(b.amount_paid)}</span></div>
          <div class="quote-line" style="font-weight:700"><span>Balance due</span><span>${money2(b.status === 'cancelled' ? 0 : balance)}</span></div>
          ${b.deposit ? `<div class="quote-line small muted"><span>Refundable deposit at pickup</span><span>${money2(b.deposit)}</span></div>` : ''}
        </div>
      </div>
      ${!S.payments_enabled && balance > 0 && b.status !== 'cancelled' && (S.payment_instructions || '').trim() ? `<div class="panel pay-info">
        <h3>How to pay</h3><p style="margin:0;white-space:pre-line">${esc(S.payment_instructions.trim())}</p>
        <p class="small muted" style="margin:.75rem 0 0">Balance due: <strong>${money2(balance)}</strong>. Questions about payment? Email <a href="mailto:${esc(S.email)}">${esc(S.email)}</a>.</p></div>` : ''}
      ${b.can_review ? `<div class="panel review-panel no-print" id="review">
        <h3 style="margin-top:0">How was your ${isRv ? 'trip' : 'stay'}?</h3>
        <p class="muted small">Share a few words about ${esc(b.item_name)}. Reviews are checked by our team before they appear on the website.</p>
        <form id="reviewForm" novalidate>
          <div id="rvMsg"></div>
          <div class="small" id="rateLbl" style="font-weight:600;margin-bottom:.3rem">Your rating</div>
          <fieldset class="star-input" aria-labelledby="rateLbl">
            ${[5, 4, 3, 2, 1].map(n => `<input type="radio" name="rating" id="star${n}" value="${n}"><label for="star${n}" title="${n} star${n > 1 ? 's' : ''}">★</label>`).join('')}
          </fieldset>
          <div class="field"><label for="rvQuote">Your review</label><textarea id="rvQuote" name="quote" maxlength="1500" placeholder="What did you enjoy? Anything we could do better?" required></textarea></div>
          <div class="row"><div class="field"><label for="rvName">Name to show</label><input id="rvName" name="name" maxlength="60" value="${esc((p => p.length > 1 ? `${p[0]} ${p.at(-1).charAt(0)}.` : p[0])(b.customer_name.trim().split(/\s+/)))}"></div>
            <div class="field"><label for="rvLoc">Hometown <span class="muted">(optional)</span></label><input id="rvLoc" name="location" maxlength="80" placeholder="e.g. Tampa, FL"></div></div>
          <button class="btn btn-primary">Submit review</button>
        </form></div>` : ''}
      <div class="no-print" style="display:flex;gap:.75rem;flex-wrap:wrap;margin:1.5rem 0 3rem">
        ${S.payments_enabled && balance > 0 && b.payment_status !== 'paid' && b.status !== 'cancelled' ? '<button class="btn btn-primary" id="payBtn">Pay ' + money2(balance) + ' now</button>' : ''}
        <button class="btn btn-ghost" onclick="window.print()">Print</button>
        <a class="btn btn-ghost" href="/contact?subject=${encodeURIComponent('Booking ' + b.code)}">Request a change</a>
        ${canCancel ? '<button class="btn btn-danger" id="cancelBtn">Cancel booking</button>' : ''}
      </div></div>`;
    const rf = $('#reviewForm');
    if (rf) {
      if (location.hash === '#review') setTimeout(() => $('#review').scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      rf.onsubmit = async ev => {
        ev.preventDefault();
        const btn = $('button', rf); btn.disabled = true;
        try {
          await api(`/bookings/${b.code}/review`, { method: 'POST', body: { ...formData(rf), email } });
          $('#review').innerHTML = '<h3 style="margin-top:0">Thank you for your review!</h3><p class="muted" style="margin:0">Our team will publish it on the website shortly.</p>';
        } catch (e) { $('#rvMsg').innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; btn.disabled = false; }
      };
    }
    const pay = $('#payBtn');
    if (pay) pay.onclick = async () => {
      pay.disabled = true;
      try { const r = await api(`/bookings/${b.code}/pay`, { method: 'POST', body: { email } }); location.href = r.checkout_url; }
      catch (e) { toast(e.message, true); pay.disabled = false; }
    };
    const cancel = $('#cancelBtn');
    if (cancel) cancel.onclick = async () => {
      if (!confirm(`Cancel booking ${b.code}?\n\n${S.cancellation_policy}`)) return;
      try { await api(`/bookings/${b.code}/cancel`, { method: 'POST', body: { email } }); toast('Your booking has been cancelled.'); navigate(`/booking/${b.code}`); }
      catch (e) { toast(e.message, true); }
    };
  }

  async function manage(_, q) {
    app.innerHTML = `<div class="container" style="max-width:520px;padding:3rem 0">
      <span class="eyebrow">Manage booking</span><h1>Find your booking</h1>
      <p class="muted">Enter the confirmation code from your booking email (for example <strong>SC-7KQ2MX</strong>) and the email you used.</p>
      <form class="panel" id="mForm">
        ${q.err ? '<div class="alert alert-error">We couldn’t find a booking with that code and email.</div>' : ''}
        <div class="field"><label>Confirmation code</label><input name="code" required placeholder="SC-XXXXXX" value="${esc(q.code || '')}" style="text-transform:uppercase"></div>
        <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
        <button class="btn btn-primary btn-block">Look up booking</button>
      </form></div>`;
    $('#mForm').onsubmit = ev => {
      ev.preventDefault();
      const f = formData(ev.target);
      const code = f.code.trim().toUpperCase();
      navigate(`/booking/${encodeURIComponent(code)}${qsOf({ email: f.email.trim() })}`);
    };
  }

  async function contact(_, q) {
    app.innerHTML = `${banner('Contact', `Let’s plan your trip`, `Questions about a rental, a site, a listing or selling your RV? Send a note and we’ll reply within one business day.`, 'band-sunset')}<div class="container">
      <div class="detail">
        <form class="panel" id="cForm" novalidate>
          <div id="cMsg"></div>
          <div class="row"><div class="field"><label>Name</label><input name="name" required autocomplete="name"></div><div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div></div>
          <div class="row"><div class="field"><label>Phone</label><input name="phone" type="tel" autocomplete="tel"></div>
            <div class="field"><label>Subject</label><input name="subject" value="${esc(q.subject || '')}" list="subjects"><datalist id="subjects"><option>RV rental question</option><option>RV site / long-term stay</option><option>Buying an RV or lot</option><option>Sell my RV</option><option>Group booking</option></datalist></div></div>
          <div class="field"><label>Message</label><textarea name="message" required style="min-height:160px"></textarea></div>
          <button class="btn btn-primary">Send message</button>
          <p class="small muted" style="margin:.75rem 0 0">We use your details only to reply to you. See our <a href="/legal/privacy">Privacy Policy</a>.</p>
        </form>
        <aside>
          <div class="panel support-card">
            <span class="eyebrow plain">Need help now?</span>
            <h3>Chat with our team</h3>
            <p class="muted small">Get instant answers to common questions, or chat live with staff during office hours. Outside hours, leave a message and we’ll reply by email.</p>
            <button class="btn btn-primary btn-block" type="button" id="openChat">Start a live chat</button>
          </div>
          <div class="panel" style="margin-top:1.25rem">
          <h3>Our locations</h3>
          <ul class="loc-list">${R.locationsFrom(S).map(l => `<li><a href="/locations/${l.slug}">${esc(l.name)}</a><span class="muted small">${roleLabel(l)}${l.city ? ` · ${esc(l.city)}` : ''}</span></li>`).join('')}</ul>
          </div>
          <div class="panel" style="margin-top:1.25rem">
          <h3>Main office</h3>
          <dl class="dl" style="grid-template-columns:1fr">
            <dt>Address</dt><dd>${esc(S.address)}</dd>
            <dt>Bookings</dt><dd><a href="mailto:${esc(S.email)}">${esc(S.email)}</a></dd>
            ${S.support_email ? `<dt>Support</dt><dd><a href="mailto:${esc(S.support_email)}">${esc(S.support_email)}</a></dd>` : ''}
            <dt>Office hours</dt><dd>${esc(S.hours)}</dd>
          </dl>
          <a class="btn btn-ghost btn-block" style="margin-top:1rem" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(S.address)}">Open in Maps</a>
          </div>
        </aside>
      </div></div>`;
    $('#openChat').onclick = () => window.RFChat?.open();
    $('#cForm').onsubmit = async ev => {
      ev.preventDefault();
      const btn = $('button', ev.target);
      btn.disabled = true;
      try {
        await api('/contact', { method: 'POST', body: formData(ev.target) });
        ev.target.reset();
        $('#cMsg').innerHTML = '<div class="alert alert-ok">Thanks — your message is in. We’ll be in touch soon.</div>';
      } catch (err) { $('#cMsg').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`; }
      btn.disabled = false;
    };
  }

  async function legal([slug]) {
    const L = window.RFLegal;
    const doc = L.render(slug || 'terms', S);
    if (slug && slug !== doc.slug) { navigate('/legal/' + doc.slug); return; }
    app.innerHTML = `${banner('Legal', esc(doc.title), esc(doc.summary), 'palms-sky')}
      <div class="container legal">
        <aside class="legal-nav">
          <nav aria-label="Legal documents">${L.docs.map(d => `<a href="/legal/${d.slug}" class="${d.slug === doc.slug ? 'active' : ''}">${esc(d.title)}</a>`).join('')}<a href="/policies">Policies & FAQ</a></nav>
          <div class="legal-toc"><span>On this page</span>${doc.sections.map(x => `<a href="#" data-toc="${x.id}">${esc(x.h)}</a>`).join('')}</div>
        </aside>
        <article class="legal-doc">
          <div class="legal-meta"><span>Effective ${esc(L.effective)}</span><span class="no-print"><button class="btn btn-ghost btn-sm" type="button" onclick="window.print()">Print</button> <a class="btn btn-ghost btn-sm" href="/contact?subject=${encodeURIComponent(doc.title + ' question')}">Contact us</a></span></div>
          ${doc.sections.map((x, i) => `<section id="${x.id}"><h2><span>${i + 1}.</span> ${esc(x.h)}</h2>${x.body}</section>`).join('')}
        </article>
      </div>`;
    $$('[data-toc]').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById(a.dataset.toc)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    const tabs = $('.legal-nav nav'), cur = $('.legal-nav nav a.active');
    if (tabs && cur && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = cur.offsetLeft - (tabs.clientWidth - cur.offsetWidth) / 2;
  }

  async function reviews() {
    const list = await api('/testimonials?limit=60');
    const avg = list.length ? list.reduce((a, t) => a + (t.rating || 0), 0) / list.length : 0;
    app.innerHTML = `${banner('Guest reviews', 'What our guests say', list.length ? `${avg.toFixed(1)} out of 5 from ${list.length} published review${list.length === 1 ? '' : 's'}. Every review comes from a real guest.` : 'Reviews from our guests will appear here.', 'life-couple')}
      <div class="container">
        ${list.length ? `<div class="testimonials">${list.map(testimonialCard).join('')}</div>`
          : '<div class="empty"><h3>No reviews yet</h3><p>Stayed with us? Open your booking from <a href="/manage">Manage Booking</a> to share your experience.</p></div>'}
        <div class="band" style="margin-top:3rem"><div><h2>Stayed with us?</h2><p>Open your booking with your confirmation code and email to leave a review.</p></div><a class="btn btn-primary" href="/manage">Review your stay</a></div>
        <div style="height:3rem"></div>
      </div>`;
  }

  // ---------------- locations ----------------
  const R = window.RFRegions;
  const roleLabel = l => l.hq ? 'Headquarters' : l.role === 'Branch' ? 'Branch' : 'Location';
  function locationCard(l, counts = {}) {
    const c = counts[l.code] || { camps: 0, rvs: 0 }, sites = c.sites || 0;
    return `<a class="card loc-card" href="/locations/${l.slug}">
      <span class="badge ${l.hq ? 'sun' : ''}">${roleLabel(l)}</span>
      <div class="media">${photo(l.photo, `${l.name} RV trip`)}</div>
      <div class="content">
        <span class="eyebrow">${esc(l.city ? `${l.city}, ${l.code}` : l.code)}</span>
        <h3>${esc(l.name)}</h3>
        ${l.blurb ? `<p class="small muted camp-desc">${esc(l.blurb)}</p>` : ''}
        <div class="specs">${c.rvs ? `<span class="chip">${c.rvs} RV rental${c.rvs === 1 ? '' : 's'}</span>` : ''}${c.camps ? `<span class="chip">${c.camps} campground${c.camps === 1 ? '' : 's'}</span>` : ''}${sites ? `<span class="chip">${sites} private RV site${sites === 1 ? '' : 's'}</span>` : ''}${!c.rvs && !c.camps && !sites ? '<span class="chip">Trips by request</span>' : ''}</div>
      </div></a>`;
  }
  async function locationCounts() {
    const [rvs, camps, lots] = await Promise.all([api('/rvs'), api('/campgrounds'), api('/lots').catch(() => [])]);
    const counts = {}, privateSites = lots.filter(isPrivate);
    for (const r of rvs.filter(r => r.status === 'active')) { const k = R.rvState(r, S); (counts[k] ||= { camps: 0, rvs: 0 }).rvs++; }
    for (const c of camps) { const k = R.campState(c); (counts[k] ||= { camps: 0, rvs: 0 }).camps++; }
    for (const l of privateSites) { const k = R.stateOf(l.campground_location); (counts[k] ||= { camps: 0, rvs: 0 }).sites = (counts[k].sites || 0) + 1; }
    return { rvs, camps, privateSites, counts };
  }
  async function locations() {
    const locs = R.locationsFrom(S), { counts } = await locationCounts();
    const hq = locs.find(l => l.hq);
    app.innerHTML = `${banner('Locations', 'Where we are', `Headquartered in ${esc(hq ? hq.name : '')}, with RV rentals, campgrounds and sales across ${esc(R.regionsLabel(S))}.`, 'state-utah')}
      <div class="container">
        <div class="grid">${locs.map(l => locationCard(l, counts)).join('')}</div>
        ${hq ? `<div class="panel hq-panel"><div><span class="eyebrow">Main office · ${esc(hq.name)}</span><h3>${esc(S.business_name)}</h3>
          <p class="muted" style="margin:0">${esc(S.address)}<br>${esc(S.hours)}</p></div>
          <div class="hq-actions"><a class="btn btn-primary" href="mailto:${esc(S.email)}">${esc(S.email)}</a>${S.support_email ? `<a class="btn btn-ghost" href="mailto:${esc(S.support_email)}">${esc(S.support_email)}</a>` : ''}</div></div>` : ''}
        <div style="height:3rem"></div>
      </div>`;
  }
  async function locationPage([slug]) {
    const l = R.locationsFrom(S).find(x => x.slug === slug);
    if (!l) { app.innerHTML = `<div class="container loading"><h2>Location not found</h2><a class="btn btn-dark" href="/locations">All locations</a></div>`; return; }
    const { rvs, camps, privateSites } = await locationCounts();
    const rs = rvs.filter(r => r.status === 'active' && R.rvState(r, S) === l.code), cs = camps.filter(c => R.campState(c) === l.code);
    const ps = privateSites.filter(x => R.stateOf(x.campground_location) === l.code);
    app.innerHTML = `<section class="page-banner">${photo(l.photo, `${l.name} RV travel`, { large: true, eager: true })}
        <div class="container"><span class="eyebrow">${roleLabel(l)}${l.city ? ` · ${esc(l.city)}, ${l.code}` : ''}</span><h1>${esc(S.business_name.replace(/,?\s+LLC$/i, ''))} in ${esc(l.name)}</h1>
        ${l.blurb ? `<p>${esc(l.blurb)}</p>` : ''}</div></section>
      <div class="container">
        <div class="crumbs"><a href="/locations">Locations</a> / ${esc(l.name)}</div>
        ${cs.length ? `<div class="section-head"><div><span class="eyebrow">Stay</span><h2>Campgrounds in ${esc(l.name)}</h2></div></div>
          <div class="grid">${cs.map(c => campCard(c)).join('')}</div>` : ''}
        ${ps.length ? `<div class="section-head" style="margin-top:${cs.length ? '3rem' : '0'}"><div><span class="eyebrow">Stay</span><h2>Private RV sites in ${esc(l.name)}</h2></div></div>
          <div class="grid">${ps.map(x => lotCard(x)).join('')}</div>` : ''}
        ${rs.length ? `<div class="section-head" style="margin-top:${cs.length || ps.length ? '3rem' : '0'}"><div><span class="eyebrow">Rent</span><h2>RVs you can pick up in ${esc(l.name)}</h2></div><a class="btn btn-ghost" href="/rentals?state=${l.code}">Check dates</a></div>
          <div class="grid">${rs.map(r => rvCard(r)).join('')}</div>` : ''}
        ${!rs.length && !cs.length && !ps.length ? `<div class="panel trip-panel"><h2 style="margin-top:0">Planning a trip in ${esc(l.name)}?</h2>
          <p class="muted">Tell us your dates, group size and where you're headed. Our ${l.role === 'Branch' ? `${esc(l.name)} branch` : 'team'} will help you find the right RV, delivery option or campsite.</p>
          <div class="band-actions"><a class="btn btn-primary" href="/contact?subject=${encodeURIComponent('Trip in ' + l.name)}">Plan my trip</a><button class="btn btn-ghost" type="button" id="locChat">Chat with us</button></div></div>` : ''}
        <div class="band" style="margin-top:3rem"><div><h2>Talk to our ${esc(l.name)} team</h2><p>Email <strong>${esc(S.email)}</strong> about bookings${S.support_email ? ` or <strong>${esc(S.support_email)}</strong> for anything else` : ''}. We reply within one business day.</p></div>
          <div class="band-actions"><a class="btn btn-primary" href="mailto:${esc(S.email)}">Email us</a><a class="btn btn-outline-light" href="/contact?subject=${encodeURIComponent(l.name + ' question')}">Send a message</a></div></div>
        <div style="height:3rem"></div>
      </div>`;
    const lc = $('#locChat'); if (lc) lc.onclick = () => window.RFChat?.open();
  }

  async function policies() {
    app.innerHTML = `${banner('Policies & FAQ', 'The fine print, in plain English', 'Rental terms, park rules, cancellations and the questions guests ask most.', 'palms-sky')}<div class="container" style="max-width:860px">
      <div class="panel" style="margin-bottom:1rem"><h3>RV rental terms</h3><p>${esc(S.rental_policy)}</p><p class="muted small" style="margin:0">Pickup ${esc(S.rv_pickup_time)} · Return ${esc(S.rv_return_time)}</p></div>
      <div class="panel" style="margin-bottom:1rem"><h3>RV site rules</h3><p>${esc(S.site_policy)}</p><p class="muted small" style="margin:0">Check-in ${esc(S.check_in_time)} · Check-out ${esc(S.check_out_time)}</p></div>
      <div class="panel" style="margin-bottom:2rem"><h3>Cancellation policy</h3><p style="margin:0">${esc(S.cancellation_policy)}</p></div>
      <div class="panel" style="margin-bottom:2rem"><h3>Legal</h3><p style="margin:0">Read our full <a href="/legal/terms">Terms of Service</a>, <a href="/legal/privacy">Privacy Policy</a>, <a href="/legal/cancellation">Cancellation & Refund Policy</a> and <a href="/legal/accessibility">Accessibility Statement</a>.</p></div>
      <h2>Frequently asked questions</h2>
      <div class="faq">${(S.faq || []).map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>
      <div style="height:3rem"></div></div>`;
  }

  // ---------------- boot ----------------
  async function boot() {
    $('#navToggle').onclick = () => { const n = $('#nav'); n.classList.toggle('open'); $('#navToggle').setAttribute('aria-expanded', n.classList.contains('open')); };
    $('#year').textContent = new Date().getFullYear();
    // The server sends the settings with the page; fetch them only if they're missing.
    S = window.RF_SETTINGS || await api('/settings').catch(() => ({}));
    $('#brand').innerHTML = window.RFArt.lockup();
    $('#footBrand').innerHTML = window.RFArt.lockup(true);
    $('#topHours').textContent = S.hours ? `Office hours: ${S.hours}` : '';
    $('#topEmail').textContent = S.email || '';
    $('#topEmail').href = `mailto:${S.email || ''}`;
    $('#footEmail').href = `mailto:${S.email || ''}`;
    $('#footTagline').textContent = S.tagline || '';
    $('#footContact').innerHTML = `<li>${esc(S.address)}</li><li>Bookings: <a href="mailto:${esc(S.email)}">${esc(S.email)}</a></li>${S.support_email ? `<li>Support: <a href="mailto:${esc(S.support_email)}">${esc(S.support_email)}</a></li>` : ''}<li>${esc(S.hours)}</li>`;
    render();
  }
  boot();
})();
