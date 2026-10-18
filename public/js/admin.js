// STAYCAMPRV LLC — admin back office.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = $('#root');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const money2 = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad2 = n => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fmtDate = s => s ? new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const pill = s => `<span class="status-pill st-${esc(s)}">${esc(String(s ?? '').replace('_', ' '))}</span>`;
  const formData = form => Object.fromEntries(new FormData(form).entries());
  const BOOKING_STATUSES = ['pending', 'confirmed', 'checked_in', 'completed', 'cancelled'];
  const PAY_STATUSES = ['unpaid', 'partial', 'paid', 'refunded'];
  let SCHEMA = null, USER = null, counts = {};

  async function api(path, { method = 'GET', body, raw = false } = {}) {
    const res = await fetch((raw ? '/api' : '/api/admin') + path, {
      method, headers: { 'X-RF-Admin': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/auth/login') { showLogin(); throw new Error('Please sign in.'); }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }
  function toast(msg, error = false) {
    const t = document.createElement('div');
    t.className = 'toast' + (error ? ' error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }
  function modal(title, bodyHtml, footHtml = '') {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>${esc(title)}</h3><button type="button" aria-label="Close" data-close>×</button></div>
      <div class="modal-body">${bodyHtml}</div>${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ''}</div>`;
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
    $$('[data-close]', wrap).forEach(b => b.onclick = close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    return { el: wrap, close };
  }

  // ---------------- auth ----------------
  function showLogin() {
    clearInterval(CHAT.timer);
    document.title = 'Admin · STAYCAMPRV';
    root.innerHTML = `<div class="login-wrap">
      <div class="login-art">${window.RFArt.photo('resort-palms', '', { large: true, eager: true })}
        <h2>Run the fleet, the park and the sales lot from one place.</h2><p>Bookings, occupancy, inventory and inquiries.</p></div>
      <div class="login-side"><form class="login-card" id="login">
      <div class="brand" style="margin-bottom:2rem">${window.RFArt.lockup()}</div>
      <h1>Welcome back</h1><p class="muted" style="margin-bottom:1.5rem">Sign in to the back office.</p>
      <div id="lErr"></div>
      <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="username"></div>
      <div class="field"><label>Password</label><input name="password" type="password" required autocomplete="current-password"></div>
      <button class="btn btn-primary btn-block">Sign in</button>
      <p class="small muted center" style="margin:1rem 0 0"><a href="/">← Back to website</a></p>
    </form></div></div>`;
    $('#login').onsubmit = async ev => {
      ev.preventDefault();
      try {
        USER = await api('/auth/login', { method: 'POST', body: formData(ev.target), raw: true });
        start();
      } catch (e) { $('#lErr').innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; }
    };
  }

  // ---------------- shell ----------------
  const VIEWS = [
    ['dashboard', 'Dashboard'], ['chat', 'Live Chat'], ['bookings', 'Bookings'], ['calendar', 'Calendar'], ['rvs', 'RV Fleet'], ['campgrounds', 'Campgrounds'], ['lots', 'RV Sites / Pads'],
    ['sales', 'Sales Listings'], ['inquiries', 'Sales Inquiries'], ['messages', 'Messages'], ['testimonials', 'Testimonials'], ['settings', 'Settings']
  ];
  function shell() {
    root.innerHTML = `<div class="admin-shell">
      <aside class="admin-side" id="side">
        <a class="brand" href="#dashboard">${window.RFArt.lockup(true)}</a><div class="side-label">Back office</div>
        <nav class="admin-nav" id="anav">${VIEWS.map(([k, l]) => `<a href="#${k}" data-v="${k}">${l}<span class="count hidden" data-count="${k}"></span></a>`).join('')}</nav>
        <div class="side-foot"><div>${esc(USER.email)}</div><div style="margin-top:.4rem"><a href="/" target="_blank">View website</a> · <button id="logout">Sign out</button></div></div>
      </aside>
      <main class="admin-main"><div class="admin-top"><div style="display:flex;gap:.75rem;align-items:center"><button class="btn btn-ghost btn-sm admin-menu-btn" id="menuBtn">☰</button><h1 id="vTitle"></h1></div><div id="vActions" style="display:flex;gap:.5rem;flex-wrap:wrap"></div></div><div id="view"></div></main>
    </div>`;
    $('#logout').onclick = async () => { await api('/auth/logout', { method: 'POST', raw: true }).catch(() => {}); showLogin(); };
    $('#menuBtn').onclick = () => $('#side').classList.toggle('open');
  }
  function setCounts() {
    const map = { testimonials: counts.pending_reviews, chat: counts.unread_chats, bookings: counts.pending_bookings, inquiries: counts.new_inquiries, messages: counts.new_messages };
    for (const [k, v] of Object.entries(map)) {
      const el = $(`[data-count="${k}"]`);
      if (el) { el.textContent = v; el.classList.toggle('hidden', !v); }
    }
  }
  async function refreshCounts() { try { counts = await api('/stats'); setCounts(); } catch {} }

  async function route() {
    if (!USER) return;
    const v = location.hash.replace('#', '') || 'dashboard';
    const view = VIEWS.find(x => x[0] === v) ? v : 'dashboard';
    $$('#anav a').forEach(a => a.classList.toggle('active', a.dataset.v === view));
    $('#side').classList.remove('open');
    $('#vTitle').textContent = VIEWS.find(x => x[0] === view)[1];
    $('#vActions').innerHTML = '';
    CHAT.active = view === 'chat';
    $('#view').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      if (view === 'dashboard') await dashboard();
      else if (view === 'chat') await chatView();
      else if (view === 'bookings') await bookings();
      else if (view === 'calendar') await calendarView();
      else if (['rvs', 'campgrounds', 'lots', 'sales', 'testimonials'].includes(view)) await resource(view);
      else if (view === 'inquiries' || view === 'messages') await inbox(view);
      else if (view === 'settings') await settings();
    } catch (e) { $('#view').innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; }
  }
  window.addEventListener('hashchange', route);

  // ---------------- dashboard ----------------
  async function dashboard() {
    const s = counts = await api('/stats');
    setCounts();
    const occ = s.lot_occupancy.total ? Math.round(s.lot_occupancy.occupied / s.lot_occupancy.total * 100) : 0;
    const fleet = s.fleet_out.total ? Math.round(s.fleet_out.out / s.fleet_out.total * 100) : 0;
    const max = Math.max(1, ...s.revenue.map(r => r.rentals + r.sales));
    const listItem = (b, dateKey) => `<li data-bid="${b.id}" style="cursor:pointer"><span><strong>${esc(b.customer_name)}</strong><br><span class="small muted">${esc(b.item_name)} · ${esc(b.code)}</span></span><span class="small" style="text-align:right">${fmtDate(b[dateKey])}<br>${pill(b.status)}</span></li>`;
    $('#vActions').innerHTML = '<a class="btn btn-primary btn-sm" href="#bookings" id="newBk">+ New booking</a>';
    $('#newBk').onclick = e => { e.preventDefault(); newBookingModal(); };
    $('#view').innerHTML = `
      <div class="kpis">
        <div class="kpi"><span>Rental revenue · this month</span><strong>${money(s.month_rental_revenue)}</strong><em>${money(s.collected_this_month)} collected</em></div>
        <div class="kpi"><span>Site occupancy · tonight</span><strong>${occ}%</strong><em>${s.lot_occupancy.occupied} of ${s.lot_occupancy.total} sites</em><div class="meter"><i style="width:${occ}%"></i></div></div>
        <div class="kpi"><span>Fleet out · today</span><strong>${s.fleet_out.out}/${s.fleet_out.total}</strong><em>${fleet}% utilization</em><div class="meter"><i style="width:${fleet}%"></i></div></div>
        <div class="kpi"><span>Needs attention</span><strong>${s.pending_bookings + s.new_inquiries + s.new_messages + (s.unread_chats || 0)}</strong><em>${s.pending_bookings} pending · ${s.new_inquiries} inquiries · ${s.new_messages} messages · ${s.unread_chats || 0} chats</em></div>
        <div class="kpi"><span>Sales closed · YTD</span><strong>${money(s.ytd_sales)}</strong><em>${s.active_listings} active listings</em></div>
      </div>
      <div class="admin-grid">
        <div class="panel"><h3>Revenue · last 6 months</h3>
          <div class="legend"><span><i style="background:var(--sun)"></i>Rentals & sites</span><span><i style="background:var(--palm-2)"></i>RV & lot sales</span></div>
          <div class="chart">${s.revenue.map(r => `<div class="col" title="${esc(r.month)}: rentals ${money(r.rentals)}, sales ${money(r.sales)}">
            <span class="val">${money(r.rentals + r.sales)}</span>
            ${r.sales ? `<div class="bar s" style="height:${r.sales / max * 85}%"></div>` : ''}
            <div class="bar r" style="height:${Math.max(r.rentals ? 1 : 0, r.rentals / max * 85)}%"></div></div>`).join('')}</div>
          <div class="chart-labels">${s.revenue.map(r => `<span>${new Date(r.month + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</span>`).join('')}</div>
        </div>
        <div class="panel"><h3>Arrivals · next 7 days</h3>${s.arrivals.length ? `<ul class="mini-list">${s.arrivals.map(b => listItem(b, 'start_date')).join('')}</ul>` : '<p class="muted">No arrivals scheduled.</p>'}</div>
        <div class="panel"><h3>Departures · next 7 days</h3>${s.departures.length ? `<ul class="mini-list">${s.departures.map(b => listItem(b, 'end_date')).join('')}</ul>` : '<p class="muted">No departures scheduled.</p>'}</div>
      </div>`;
    const all = [...s.arrivals, ...s.departures];
    $$('[data-bid]').forEach(li => li.onclick = () => bookingModal(all.find(b => b.id === Number(li.dataset.bid)), dashboard));
  }

  // ---------------- bookings ----------------
  let bookingFilter = { q: '', status: '', kind: '', when: 'upcoming' };
  async function bookings() {
    const list = await api('/bookings');
    $('#vActions').innerHTML = '<a class="btn btn-ghost btn-sm" href="/api/admin/export/bookings.csv">Export CSV</a><button class="btn btn-primary btn-sm" id="newBk">+ New booking</button>';
    $('#newBk').onclick = () => newBookingModal();
    $('#view').innerHTML = `<div class="toolbar">
        <input class="grow" id="fq" placeholder="Search name, email, code, RV or site…" value="${esc(bookingFilter.q)}">
        <select id="fwhen">${[['upcoming', 'Upcoming & current'], ['past', 'Past'], ['all', 'All dates']].map(([v, l]) => `<option value="${v}" ${v === bookingFilter.when ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select id="fstatus"><option value="">All statuses</option>${BOOKING_STATUSES.map(s => `<option value="${s}" ${s === bookingFilter.status ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}</select>
        <select id="fkind"><option value="">RVs & sites</option><option value="rv" ${bookingFilter.kind === 'rv' ? 'selected' : ''}>RV rentals</option><option value="lot" ${bookingFilter.kind === 'lot' ? 'selected' : ''}>RV sites</option></select>
      </div><div class="table-wrap" id="bt"></div>`;
    const draw = () => {
      const t = todayStr(), q = bookingFilter.q.toLowerCase();
      let rows = list.filter(b => (!bookingFilter.status || b.status === bookingFilter.status) && (!bookingFilter.kind || b.kind === bookingFilter.kind)
        && (bookingFilter.when === 'all' || (bookingFilter.when === 'upcoming' ? b.end_date >= t : b.end_date < t))
        && (!q || [b.code, b.customer_name, b.customer_email, b.item_name, b.customer_phone].join(' ').toLowerCase().includes(q)));
      if (bookingFilter.when === 'upcoming') rows = rows.sort((a, b) => a.start_date.localeCompare(b.start_date));
      $('#bt').innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>Code</th><th>Guest</th><th>RV / Site</th><th>Dates</th><th>Nights</th><th>Total</th><th>Paid</th><th>Status</th><th>Payment</th></tr></thead><tbody>
        ${rows.map(b => `<tr class="clickable" data-id="${b.id}"><td><strong>${esc(b.code)}</strong></td><td>${esc(b.customer_name)}<br><span class="small muted">${esc(b.customer_email)}</span></td>
          <td>${esc(b.item_name)}<br><span class="small muted">${b.kind === 'rv' ? 'RV rental' : 'RV site'}</span></td><td style="white-space:nowrap">${fmtDate(b.start_date)} →<br>${fmtDate(b.end_date)}</td><td>${b.nights}</td>
          <td>${money2(b.total)}</td><td>${money2(b.amount_paid)}</td><td>${pill(b.status)}</td><td>${pill(b.payment_status)}</td></tr>`).join('')}
        </tbody></table>` : '<div class="empty" style="border:0">No bookings match these filters.</div>';
      $$('#bt tr[data-id]').forEach(tr => tr.onclick = () => bookingModal(list.find(b => b.id === Number(tr.dataset.id)), bookings));
    };
    $('#fq').oninput = e => { bookingFilter.q = e.target.value; draw(); };
    $('#fwhen').onchange = e => { bookingFilter.when = e.target.value; draw(); };
    $('#fstatus').onchange = e => { bookingFilter.status = e.target.value; draw(); };
    $('#fkind').onchange = e => { bookingFilter.kind = e.target.value; draw(); };
    draw();
  }

  function bookingModal(b, after) {
    if (!b) return;
    const balance = Math.max(0, b.total - b.amount_paid);
    const m = modal(`Booking ${b.code}`, `
      <div class="row" style="grid-template-columns:1fr 1fr;align-items:start">
        <dl class="dl">
          <dt>${b.kind === 'rv' ? 'RV' : 'Site'}</dt><dd>${esc(b.item_name)}</dd>
          <dt>Dates</dt><dd>${fmtDate(b.start_date)} → ${fmtDate(b.end_date)} (${b.nights} nights)</dd>
          <dt>Guests</dt><dd>${b.guests}</dd>${b.rig_info ? `<dt>Rig</dt><dd>${esc(b.rig_info)}</dd>` : ''}
          <dt>Guest</dt><dd>${esc(b.customer_name)}</dd>
          <dt>Email</dt><dd><a href="mailto:${esc(b.customer_email)}?subject=${encodeURIComponent('Your STAYCAMPRV booking ' + b.code)}">${esc(b.customer_email)}</a></dd>
          <dt>Phone</dt><dd>${b.customer_phone ? `<a href="tel:${esc(b.customer_phone)}">${esc(b.customer_phone)}</a>` : '—'}</dd>
          <dt>Source</dt><dd>${esc(b.source)} · ${fmtDate(b.created_at)}</dd>
          ${b.notes ? `<dt>Guest notes</dt><dd>${esc(b.notes)}</dd>` : ''}
        </dl>
        <div>
          <div class="quote-line"><span>Base</span><span>${money2(b.base)}</span></div>
          ${(b.addons || []).map(a => `<div class="quote-line"><span>${esc(a.name)}</span><span>${money2(a.amount)}</span></div>`).join('')}
          ${b.fees ? `<div class="quote-line"><span>Cleaning fee</span><span>${money2(b.fees)}</span></div>` : ''}
          <div class="quote-line"><span>Tax</span><span>${money2(b.tax)}</span></div>
          <div class="quote-line total"><span>Total</span><span>${money2(b.total)}</span></div>
          <div class="quote-line"><span>Balance</span><span>${money2(balance)}</span></div>
          ${b.deposit ? `<div class="quote-line small muted"><span>Security deposit</span><span>${money2(b.deposit)}</span></div>` : ''}
        </div>
      </div>
      <form id="bkForm" style="margin-top:1.25rem">
        <div class="row">
          <div class="field"><label>Status</label><select name="status">${BOOKING_STATUSES.map(s => `<option value="${s}" ${s === b.status ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}</select></div>
          <div class="field"><label>Payment</label><select name="payment_status">${PAY_STATUSES.map(s => `<option ${s === b.payment_status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label>Amount paid ($)</label><input name="amount_paid" type="number" step="0.01" min="0" value="${b.amount_paid}"></div>
        </div>
        <div class="field"><label>Internal notes</label><textarea name="admin_notes">${esc(b.admin_notes || '')}</textarea></div>
        <label class="check"><input type="checkbox" name="notify" checked> <span>Email ${esc(b.customer_email)} when I confirm, cancel or mark this booking paid</span></label>
      </form>`,
      `<div class="left" style="display:flex;gap:.4rem;flex-wrap:wrap">
        ${b.status === 'pending' ? '<button class="btn btn-ghost btn-sm" data-quick="confirmed">Confirm</button>' : ''}
        ${['pending', 'confirmed'].includes(b.status) ? '<button class="btn btn-ghost btn-sm" data-quick="checked_in">Check in</button>' : ''}
        ${b.status === 'checked_in' ? '<button class="btn btn-ghost btn-sm" data-quick="completed">Check out</button>' : ''}
        ${b.payment_status !== 'paid' ? '<button class="btn btn-ghost btn-sm" data-pay>Mark paid in full</button>' : ''}
        <button class="btn btn-ghost btn-sm" data-resend>✉ Resend ${b.status === 'cancelled' ? 'cancellation' : 'confirmation'}</button>
      </div><button class="btn btn-ghost" data-close>Close</button><button class="btn btn-primary" id="bkSave">Save</button>`);
    const f = $('#bkForm', m.el);
    const save = async () => {
      const d = formData(f);
      try {
        await api('/bookings/' + b.id, { method: 'PATCH', body: { ...d, notify: Boolean(d.notify), amount_paid: Number(d.amount_paid) } });
        m.close(); toast('Booking updated'); refreshCounts(); after?.();
      } catch (e) { toast(e.message, true); }
    };
    $('#bkSave', m.el).onclick = save;
    $$('[data-quick]', m.el).forEach(btn => btn.onclick = () => { f.status.value = btn.dataset.quick; save(); });
    const pay = $('[data-pay]', m.el);
    if (pay) pay.onclick = () => { f.payment_status.value = 'paid'; f.amount_paid.value = b.total; save(); };
    $('[data-resend]', m.el).onclick = async e => {
      const btn = e.currentTarget; btn.disabled = true;
      try { const r = await api(`/bookings/${b.id}/email`, { method: 'POST', body: {} }); toast(`Email sent to ${r.to}`); }
      catch (er) { toast(er.message, true); }
      btn.disabled = false;
    };
  }

  async function newBookingModal(preset = {}) {
    const [rvs, lots, cfg] = await Promise.all([api('/rvs'), api('/lots'), api('/settings')]);
    const t = todayStr();
    const m = modal('New booking', `<form id="nb">
      <div id="nbErr"></div>
      <div class="form-grid">
        <div class="field"><label>Booking type</label><select name="kind"><option value="rv">RV rental</option><option value="lot">RV site</option></select></div>
        <div class="field"><label>RV / Site</label><select name="item_id"></select></div>
        <div class="field"><label>Start</label><input type="date" name="start" value="${preset.start || t}" required></div>
        <div class="field"><label>End</label><input type="date" name="end" value="${preset.end || addDays(t, 3)}" required></div>
        <div class="field"><label>Guest name</label><input name="name" required></div>
        <div class="field"><label>Email</label><input name="email" type="email" required></div>
        <div class="field"><label>Phone</label><input name="phone" type="tel"></div>
        <div class="field"><label>Guests</label><input name="guests" type="number" min="1" value="2"></div>
        <div class="field" data-lot><label>Rig type</label><input name="rig_type" placeholder="e.g. Fifth wheel"></div>
        <div class="field" data-lot><label>Rig length (ft)</label><input name="rig_length" type="number" min="0"></div>
        <div class="field"><label>Initial status</label><select name="status"><option value="confirmed">Confirmed</option><option value="pending">Pending</option></select></div>
        <div class="field full"><label>Add-ons</label><div id="nbAddons"></div></div>
        <div class="field full"><label>Notes</label><textarea name="notes" style="min-height:70px"></textarea></div>
      </div>
      <div id="nbQuote" class="panel" style="box-shadow:none;background:var(--sand)"></div>
    </form>`, '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="nbSave">Create booking</button>');
    const f = $('#nb', m.el);
    const fillItems = () => {
      const kind = f.kind.value;
      const items = kind === 'rv' ? rvs.filter(r => r.status === 'active') : lots.filter(l => l.status === 'active');
      f.item_id.innerHTML = items.map(i => `<option value="${i.id}" ${String(i.id) === String(preset.item_id) ? 'selected' : ''}>${esc(kind === 'rv' ? `${i.name} (${i.type})` : `Site ${i.code} · ${i.campground_name || i.section}`)}</option>`).join('');
      $$('[data-lot]', f).forEach(x => x.classList.toggle('hidden', kind !== 'lot'));
      const addons = (kind === 'rv' ? cfg.rv_addons : cfg.lot_addons) || [];
      $('#nbAddons', f).innerHTML = addons.map(a => `<label class="check" style="margin-bottom:.3rem"><input type="checkbox" name="addon" value="${esc(a.id)}"> ${esc(a.name)} <span class="muted">(${money(a.price)}${a.per === 'night' ? '/night' : ''})</span></label>`).join('') || '<span class="muted small">None configured</span>';
    };
    const quote = async () => {
      const d = formData(f);
      const addons = $$('input[name=addon]:checked', f).map(x => x.value);
      try {
        const q = await api('/quote', { method: 'POST', body: { kind: d.kind, item_id: d.item_id, start: d.start, end: d.end, addons } });
        $('#nbQuote', m.el).innerHTML = q.lines.map(l => `<div class="quote-line"><span>${esc(l.label)}</span><span>${money2(l.amount)}</span></div>`).join('')
          + `<div class="quote-line total"><span>Total</span><span>${money2(q.total)}</span></div>` + (q.available ? '' : '<div class="alert alert-error" style="margin:.5rem 0 0">Not available for these dates.</div>');
      } catch (e) { $('#nbQuote', m.el).innerHTML = `<span class="small" style="color:var(--danger)">${esc(e.message)}</span>`; }
    };
    if (preset.kind) f.kind.value = preset.kind;
    fillItems(); quote();
    f.onchange = ev => { if (ev.target.name === 'kind') fillItems(); quote(); };
    $('#nbSave', m.el).onclick = async () => {
      const d = formData(f);
      d.addons = $$('input[name=addon]:checked', f).map(x => x.value);
      try {
        const b = await api('/bookings', { method: 'POST', body: d });
        m.close(); toast(`Booking ${b.code} created`); refreshCounts(); route();
      } catch (e) { $('#nbErr', m.el).innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; }
    };
  }

  // ---------------- occupancy calendar ----------------
  let calState = { kind: 'lot', start: null };
  async function calendarView() {
    if (!calState.start) calState.start = addDays(todayStr(), -3);
    const [list, items] = await Promise.all([api('/bookings'), api(calState.kind === 'rv' ? '/rvs' : '/lots')]);
    const days = Array.from({ length: 28 }, (_, i) => addDays(calState.start, i));
    const t = todayStr();
    const live = list.filter(b => b.kind === calState.kind && b.status !== 'cancelled' && b.end_date > days[0] && b.start_date <= days[27]);
    $('#vActions').innerHTML = `<div class="tabs" style="margin:0"><button data-k="lot" class="${calState.kind === 'lot' ? 'active' : ''}">RV sites</button><button data-k="rv" class="${calState.kind === 'rv' ? 'active' : ''}">RV fleet</button></div>
      <button class="btn btn-ghost btn-sm" data-shift="-14">‹ 2 weeks</button><button class="btn btn-ghost btn-sm" data-shift="0">Today</button><button class="btn btn-ghost btn-sm" data-shift="14">2 weeks ›</button>`;
    $$('#vActions [data-k]').forEach(b => b.onclick = () => { calState.kind = b.dataset.k; calendarView(); });
    $$('#vActions [data-shift]').forEach(b => b.onclick = () => { const n = Number(b.dataset.shift); calState.start = n ? addDays(calState.start, n) : addDays(t, -3); calendarView(); });
    $('#view').innerHTML = `<p class="muted small">Click a booked cell to open the booking, or an empty cell to create one starting that day.
      <span style="margin-left:1rem"><span class="status-pill" style="background:var(--sun);color:#fff">confirmed</span> <span class="status-pill" style="background:#f7b98f">pending</span> <span class="status-pill" style="background:#42a5f5;color:#fff">checked in</span> <span class="status-pill" style="background:#b0bec5">completed</span></span></p>
      <div class="timeline"><table><thead><tr><th class="name">${calState.kind === 'rv' ? 'RV' : 'Site'}</th>${days.map(d => { const dt = new Date(d + 'T00:00:00'); const w = dt.getDay() % 6 === 0; return `<th class="${w ? 'wknd' : ''} ${d === t ? 'today' : ''}">${dt.toLocaleDateString('en-US', { weekday: 'narrow' })}<br>${dt.getDate()}</th>`; }).join('')}</tr></thead>
      <tbody>${items.filter(i => i.status !== 'retired' && i.status !== 'closed').map(i => `<tr><td class="name">${esc(calState.kind === 'rv' ? i.name : i.code)}${calState.kind !== 'rv' && i.campground_name ? ` <span class="small muted">${esc(i.campground_name)}</span>` : ''}${i.status !== 'active' ? ' <span class="small muted">(' + esc(i.status) + ')</span>' : ''}</td>${days.map(d => {
        const b = live.find(x => x.item_id === i.id && x.start_date <= d && x.end_date > d);
        return b ? `<td class="b ${b.status}" data-bid="${b.id}" title="${esc(b.customer_name)} · ${esc(b.code)} · ${b.start_date} → ${b.end_date}"></td>` : `<td class="${d === t ? 'today' : ''}" data-new="${i.id}" data-d="${d}" style="cursor:copy"></td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
    $$('#view [data-bid]').forEach(td => td.onclick = () => bookingModal(list.find(b => b.id === Number(td.dataset.bid)), calendarView));
    $$('#view [data-new]').forEach(td => td.onclick = () => { if (td.dataset.d >= t) newBookingModal({ kind: calState.kind, item_id: td.dataset.new, start: td.dataset.d, end: addDays(td.dataset.d, calState.kind === 'rv' ? 3 : 2) }); });
  }

  // ---------------- inventory CRUD ----------------
  const COLUMNS = {
    rvs: [['Name', r => `<strong>${esc(r.name)}</strong><br><span class="small muted">${esc([r.year, r.make, r.model].filter(Boolean).join(' '))}</span>`], ['Type', r => esc(r.type)], ['Sleeps', r => r.sleeps], ['Nightly', r => money(r.nightly_rate)], ['Weekly', r => r.weekly_rate ? money(r.weekly_rate) : '—'], ['Status', r => pill(r.status)]],
    testimonials: [['Guest', r => `<strong>${esc(r.name)}</strong>${r.location ? `<br><span class="small muted">${esc(r.location)}</span>` : ''}`],
      ['Rating', r => `<span class="stars" aria-label="${r.rating} out of 5">${'★'.repeat(r.rating || 0)}<span class="off">${'★'.repeat(5 - (r.rating || 0))}</span></span>`],
      ['Testimonial', r => `<span class="small">${esc(String(r.quote || '').slice(0, 110))}${String(r.quote || '').length > 110 ? '…' : ''}</span>${r.stay ? `<br><span class="small muted">${esc(r.stay)}</span>` : ''}`],
      ['Source', r => r.source === 'guest' ? `<span class="small">Guest review<br><span class="muted">${esc(r.booking_code || '')}</span></span>` : '<span class="small muted">Added by staff</span>'],
      ['Status', r => pill(r.status) + (r.featured ? ' <span class="small muted">· featured</span>' : '')]],
    campgrounds: [['Campground', r => `<strong>${esc(r.name)}</strong><br><span class="small muted">${esc(r.location || '')}</span>`], ['Pads', r => `<a href="#lots" data-camp-filter="${r.id}">${r.pad_count} site${r.pad_count === 1 ? '' : 's'}</a>`], ['From', r => r.from_rate != null ? money(r.from_rate) + '/night' : '—'], ['Order', r => r.sort_order ?? '—'], ['Status', r => pill(r.status === 'hidden' ? 'closed' : r.status).replace('>closed<', '>hidden<') + (r.featured ? ' <span class="small muted">· featured</span>' : '')]],
    lots: [['Site', r => `<strong>${esc(r.code)}</strong>`], ['Campground', r => esc(r.campground_name || '—')], ['Section', r => esc(r.section)], ['Type', r => esc(r.site_type)], ['Max length', r => r.max_length + ' ft'], ['Nightly', r => money(r.nightly_rate)], ['Monthly', r => r.monthly_rate ? money(r.monthly_rate) : '—'], ['Status', r => pill(r.status)]],
    sales: [['Listing', r => `<strong>${esc(r.title)}</strong><br><span class="small muted">${esc(r.type || '')}</span>`], ['Category', r => r.category === 'lot' ? 'RV lot' : 'RV'], ['Price', r => money(r.price)], ['Condition', r => esc(r.condition)], ['Status', r => pill(r.status) + (r.status === 'sold' ? `<br><span class="small muted">${money(r.sold_price || r.price)} · ${fmtDate(r.sold_at)}</span>` : '')]]
  };
  const KIND = { rvs: 'rv', lots: 'lot', sales: 'sale', campgrounds: 'camp' };
  let campFilter = '';
  let resFilter = '';
  async function resource(name) {
    SCHEMA = await api('/schema');
    const schema = SCHEMA[name];
    const rows = await api('/' + name);
    const camps = name === 'lots' ? (schema.fields.find(f => f.key === 'campground_id')?.options || []) : [];
    $('#vActions').innerHTML = `<button class="btn btn-primary btn-sm" id="addBtn">+ Add ${{ rvs: 'RV', lots: 'site / pad', campgrounds: 'campground', sales: 'listing', testimonials: 'testimonial' }[name]}</button>`;
    $('#addBtn').onclick = () => editModal(name, null);
    $('#view').innerHTML = `${name === 'testimonials' ? '<p class="small muted" style="margin:-.5rem 0 1rem">Guests are invited to review their stay when you check them out, and can also review from their booking page. New reviews arrive here as <strong>pending</strong>; set one to <strong>published</strong> to show it on the website. Only publish genuine reviews from real guests, and you can add ones you received by email, phone or in person.</p>' : ''}${name === 'campgrounds' ? '<p class="small muted" style="margin:-.5rem 0 1rem">Each campground gets its own page on the website. Add its RV sites (pads) under <a href="#lots">RV Sites / Pads</a>, each with its own price.</p>' : ''}
      <div class="toolbar"><input class="grow" id="rq" placeholder="Search…" value="${esc(resFilter)}">
      ${camps.length > 1 ? `<select id="campSel"><option value="">All campgrounds</option>${camps.map(([v, l]) => `<option value="${v}" ${String(v) === campFilter ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
      <span class="muted small" id="rCount">${rows.length} total</span></div><div class="table-wrap" id="rt"></div>`;
    const draw = () => {
      const q = resFilter.toLowerCase();
      const list = rows.filter(r => (!q || JSON.stringify(r).toLowerCase().includes(q)) && (name !== 'lots' || !campFilter || String(r.campground_id) === campFilter));
      $('#rCount').textContent = `${list.length} of ${rows.length}`;
      const thumbs = Boolean(KIND[name]);
      $('#rt').innerHTML = list.length ? `<table class="tbl"><thead><tr>${thumbs ? '<th></th>' : ''}${COLUMNS[name].map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>
        ${list.map(r => `<tr class="clickable" data-id="${r.id}">${thumbs ? `<td><div class="thumb">${window.RFArt.forItem(KIND[name], r)}</div></td>` : ''}${COLUMNS[name].map(c => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
        : `<div class="empty" style="border:0">Nothing here yet.</div>`;
      $$('#rt tr[data-id]').forEach(tr => tr.onclick = e => { if (e.target.closest('[data-camp-filter]')) return; editModal(name, rows.find(r => r.id === Number(tr.dataset.id))); });
      $$('#rt [data-camp-filter]').forEach(a => a.onclick = () => { campFilter = a.dataset.campFilter; resFilter = ''; });
    };
    $('#rq').oninput = e => { resFilter = e.target.value; draw(); };
    if ($('#campSel')) $('#campSel').onchange = e => { campFilter = e.target.value; draw(); };
    draw();
    void schema;
  }

  function fieldHtml(f, v) {
    const id = 'f_' + f.key;
    const val = v ?? '';
    const req = f.required ? 'required' : '';
    const full = ['textarea', 'list', 'image'].includes(f.type) ? 'full' : '';
    let input;
    switch (f.type) {
      case 'select': input = `<select id="${id}" name="${f.key}" ${req}>${f.options.map(o => `<option ${String(o) === String(val) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`; break;
      case 'ref': input = f.options.length
        ? `<select id="${id}" name="${f.key}" ${req}>${f.options.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
        : `<div class="alert alert-warn" style="margin:0">Add a campground first under <a href="#campgrounds" data-close>Campgrounds</a>.</div>`; break;
      case 'int': case 'real': input = `<input id="${id}" name="${f.key}" type="number" min="0" step="${f.type === 'int' ? 1 : 0.01}" value="${esc(val)}" ${req}>`; break;
      case 'bool': return `<div class="field"><label class="check" style="margin-top:1.6rem"><input type="checkbox" name="${f.key}" ${v ? 'checked' : ''}> ${esc(f.label)}</label></div>`;
      case 'color': input = `<input id="${id}" name="${f.key}" type="color" value="${esc(val || '#F26B3A')}" style="height:46px;padding:4px">`; break;
      case 'textarea': input = `<textarea id="${id}" name="${f.key}">${esc(val)}</textarea>`; break;
      case 'list': input = `<textarea id="${id}" name="${f.key}" placeholder="One per line">${esc((Array.isArray(v) ? v : []).join('\n'))}</textarea>`; break;
      case 'image': input = `<div class="img-field"><div class="thumb" data-thumb>${val ? `<img src="${esc(val)}" alt="">` : '<span class="small muted" style="display:grid;place-items:center;height:100%;text-align:center">Stock photo</span>'}</div>
        <div style="flex:1"><input id="${id}" name="${f.key}" value="${esc(val)}" placeholder="Image URL, or upload →"><div style="display:flex;gap:.5rem;margin-top:.4rem"><label class="btn btn-ghost btn-sm" style="margin:0">Upload photo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden data-upload></label><button type="button" class="btn btn-ghost btn-sm" data-clearimg>Use stock photo</button></div></div></div>`; break;
      default: input = `<input id="${id}" name="${f.key}" value="${esc(val)}" ${req}>`;
    }
    return `<div class="field ${full}"><label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>${input}</div>`;
  }
  function collect(form, fields) {
    const out = {};
    for (const f of fields) {
      const el = form.elements[f.key];
      if (!el) continue;
      if (f.type === 'bool') out[f.key] = el.checked;
      else if (f.type === 'list') out[f.key] = el.value.split('\n').map(s => s.trim()).filter(Boolean);
      else out[f.key] = el.value;
    }
    return out;
  }
  // Resize photos in the browser (max 2000 px, JPEG) so uploads stay well under the server's request size limit.
  // Small GIFs are sent as-is to keep their animation.
  const readAsDataURL = blob => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(blob);
  });
  async function shrinkImage(file) {
    if (file.type === 'image/gif' && file.size < 2.5 * 1024 * 1024) return readAsDataURL(file);
    let img;
    try { img = await createImageBitmap(file); } catch { throw new Error('Please upload a PNG, JPG, WebP or GIF image.'); }
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.7, 0.55]) {
      const data = canvas.toDataURL('image/jpeg', q);
      if (data.length < 3.5 * 1024 * 1024) return data;
    }
    throw new Error('That photo is too large. Please choose a smaller one.');
  }
  function editModal(name, row) {
    const schema = SCHEMA[name];
    const defaults = { rvs: { status: 'active', min_nights: 2, miles_per_night: 100, color: '#F26B3A', type: 'Class C Motorhome' }, lots: { status: 'active', min_nights: 1, water: 1, sewer: 1, wifi: 1, amps: '30/50', max_length: 40, site_type: 'Back-in', campground_id: campFilter || schema.fields.find(f => f.key === 'campground_id')?.options[0]?.[0] }, testimonials: { status: 'published', rating: 5 }, campgrounds: { status: 'active', amenities: ['Full hookups', 'Free Wi-Fi', 'Bathhouse & laundry', 'Pet friendly'] }, sales: { status: 'available', category: 'rv', condition: 'Used', color: '#1F6F5C' } }[name];
    const data = row || defaults;
    const title = row ? `Edit ${row[schema.title]}` : `Add ${schema.label.replace(/s$/, '').replace('Fleet', 'RV')}`;
    const m = modal(title, `<form id="edit" class="form-grid" novalidate><div class="full" id="eErr"></div>${schema.fields.map(f => fieldHtml(f, data[f.key])).join('')}</form>`,
      `${row ? '<button class="btn btn-danger left" id="delBtn">Delete</button>' : ''}<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="saveBtn">${row ? 'Save changes' : 'Create'}</button>`);
    const form = $('#edit', m.el);
    const imgInput = form.elements.image_url;
    const setThumb = url => { const th = $('[data-thumb]', form); if (th) th.innerHTML = url ? `<img src="${esc(url)}" alt="">` : '<span class="small muted" style="display:grid;place-items:center;height:100%;text-align:center">Stock photo</span>'; };
    if (imgInput) imgInput.oninput = () => setThumb(imgInput.value);
    const up = $('[data-upload]', form);
    if (up) up.onchange = async () => {
      const file = up.files[0];
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) return toast('Images must be under 25 MB.', true);
      try {
        const data = await shrinkImage(file);
        const r = await api('/upload', { method: 'POST', body: { data } });
        imgInput.value = r.url; setThumb(r.url); toast('Photo uploaded');
      } catch (e) { toast(e.message, true); }
    };
    const clr = $('[data-clearimg]', form);
    if (clr) clr.onclick = () => { imgInput.value = ''; setThumb(''); };
    $('#saveBtn', m.el).onclick = async () => {
      const body = collect(form, schema.fields);
      try {
        await api(`/${name}${row ? '/' + row.id : ''}`, { method: row ? 'PUT' : 'POST', body });
        m.close(); toast(row ? 'Saved' : 'Created'); resource(name);
      } catch (e) { $('#eErr', m.el).innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; m.el.scrollTop = 0; }
    };
    const del = $('#delBtn', m.el);
    if (del) del.onclick = async () => {
      if (!confirm(`Delete "${row[schema.title]}"? This cannot be undone.`)) return;
      try { await api(`/${name}/${row.id}`, { method: 'DELETE' }); m.close(); toast('Deleted'); resource(name); }
      catch (e) { $('#eErr', m.el).innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; }
    };
  }

  // ---------------- inquiries & messages ----------------
  async function inbox(name) {
    const rows = await api('/' + name);
    const isInq = name === 'inquiries';
    const KIND_LABEL = { info: 'Question', tour: 'Tour request', offer: 'Offer', financing: 'Financing' };
    $('#view').innerHTML = rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Received</th>${isInq ? '<th>Listing</th><th>Type</th>' : '<th>Subject</th>'}<th>From</th><th>Message</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr data-id="${r.id}">
        <td style="white-space:nowrap">${fmtDate(r.created_at)}</td>
        ${isInq ? `<td>${r.listing_title ? `<a href="/sales/${r.listing_id}" target="_blank">${esc(r.listing_title)}</a><br><span class="small muted">${money(r.listing_price)}</span>` : '<span class="muted">Removed listing</span>'}</td>
          <td>${esc(KIND_LABEL[r.kind] || r.kind)}${r.offer_amount ? `<br><strong>${money(r.offer_amount)}</strong>` : ''}${r.preferred_date ? `<br><span class="small muted">${fmtDate(r.preferred_date)}</span>` : ''}</td>` : `<td>${esc(r.subject || '—')}</td>`}
        <td><strong>${esc(r.name)}</strong><br><a class="small" href="mailto:${esc(r.email)}?subject=${encodeURIComponent('STAYCAMPRV LLC — ' + (isInq ? r.listing_title || 'your inquiry' : r.subject || 'your message'))}">${esc(r.email)}</a>${r.phone ? `<br><a class="small" href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : ''}</td>
        <td style="max-width:360px;white-space:pre-wrap">${esc(r.message || '')}</td>
        <td><select data-status style="width:auto;padding:.4rem .6rem">${['new', 'contacted', 'closed'].map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td><button class="btn btn-danger btn-sm" data-del>Delete</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Inbox zero. Nothing here yet.</div>';
    $$('#view tr[data-id]').forEach(tr => {
      const id = tr.dataset.id;
      $('[data-status]', tr).onchange = async e => { try { await api(`/${name}/${id}`, { method: 'PATCH', body: { status: e.target.value } }); toast('Updated'); refreshCounts(); } catch (er) { toast(er.message, true); } };
      $('[data-del]', tr).onclick = async () => { if (!confirm('Delete this entry?')) return; try { await api(`/${name}/${id}`, { method: 'DELETE' }); tr.remove(); refreshCounts(); } catch (er) { toast(er.message, true); } };
    });
  }

  // ---------------- settings ----------------
  function repeater(el, cols, rows) {
    const tpl = cols.map(c => `minmax(0, ${c.width || '1fr'})`).join(' ') + ' 36px';
    const rowHtml = r => `<div class="repeater-row" style="grid-template-columns:${tpl}">${cols.map(c => c.type === 'select'
      ? `<select data-k="${c.key}">${c.options.map(([v, l]) => `<option value="${v}" ${v === r[c.key] ? 'selected' : ''}>${l}</option>`).join('')}</select>`
      : c.type === 'textarea' ? `<textarea data-k="${c.key}" placeholder="${esc(c.label)}" style="min-height:60px">${esc(r[c.key] ?? '')}</textarea>`
      : `<input data-k="${c.key}" type="${c.type || 'text'}" ${c.type === 'number' ? 'step="0.01" min="0"' : ''} placeholder="${esc(c.label)}" value="${esc(r[c.key] ?? '')}">`).join('')}<button type="button" title="Remove" data-rm>×</button></div>`;
    el.innerHTML = `<div data-rows>${rows.map(rowHtml).join('')}</div><button type="button" class="btn btn-ghost btn-sm" data-add>+ Add</button>`;
    el.onclick = e => {
      if (e.target.matches('[data-rm]')) e.target.closest('.repeater-row').remove();
      if (e.target.matches('[data-add]')) $('[data-rows]', el).insertAdjacentHTML('beforeend', rowHtml(Object.fromEntries(cols.map(c => [c.key, c.type === 'select' ? c.options[0][0] : '']))));
    };
    return () => $$('.repeater-row', el).map((row, i) => {
      const o = Object.fromEntries($$('[data-k]', row).map(x => [x.dataset.k, x.type === 'number' ? Number(x.value) : x.value]));
      if ('id' in (rows[i] || {}) && rows[i]?.name === o.name) o.id = rows[i].id;
      return o;
    });
  }
  async function settings() {
    const s = await api('/settings');
    const text = (k, l, type = 'text') => `<div class="field"><label>${l}</label><input name="${k}" type="${type}" value="${esc(s[k])}"></div>`;
    const area = (k, l) => `<div class="field full"><label>${l}</label><textarea name="${k}">${esc(s[k])}</textarea></div>`;
    $('#view').innerHTML = `<form id="sForm" class="admin-grid" style="grid-template-columns:minmax(0, 1fr)">
      <div class="panel"><h3>Business</h3><div class="form-grid">
        ${text('business_name', 'Business name')}${text('tagline', 'Tagline')}${text('phone', 'Phone')}${text('email', 'Email', 'email')}
        ${text('address', 'Address')}${text('hours', 'Office hours')}${text('hero_title', 'Home page headline')}${text('hero_subtitle', 'Home page subheadline')}
      </div></div>
      <div class="panel"><h3>Locations</h3>
        <p class="small muted" style="margin-top:-.25rem">The states you operate in. Each one gets its own page on the website (e.g. /locations/arizona) and appears on the home page. Mark your main office as <strong>Headquarters</strong>. An RV's pickup location and a campground's city decide which state page they appear on.</p>
        <div id="locRep"></div></div>
      <div class="panel"><h3>Operations & pricing</h3><div class="form-grid">
        <div class="field"><label>Sales tax rate (%)</label><input name="tax_pct" type="number" step="0.01" min="0" max="49" value="${(Number(s.tax_rate) * 100).toFixed(2)}"></div>
        ${text('max_site_guests', 'Max guests per RV site', 'number')}
        ${text('check_in_time', 'Site check-in time')}${text('check_out_time', 'Site check-out time')}
        ${text('rv_pickup_time', 'RV pickup time')}${text('rv_return_time', 'RV return time')}
      </div></div>
      <div class="panel"><h3>RV rental add-ons</h3><div id="rvAdd"></div></div>
      <div class="panel"><h3>RV site add-ons</h3><div id="lotAdd"></div></div>
      <div class="panel" id="emailPanel"><h3>Email</h3><div class="form-grid">
        <div class="field full"><label>Staff notification email</label><input name="notify_email" type="email" placeholder="${esc(s.email)}" value="${esc(s.notify_email || '')}">
          <p class="small muted" style="margin:.35rem 0 0">New bookings, guest cancellations, inquiries, contact messages and chats that arrive while you’re away are sent here. Leave blank to use the business email.</p></div>
      </div><div id="emailStatus"><p class="small muted">Loading email status…</p></div></div>
      <div class="panel" id="seoPanel"><h3>Search engines (SEO)</h3>
        <p class="small muted" style="margin-top:-.25rem">Every rental, campground, RV site and listing automatically gets its own Google title, description and structured data. Here you can fine-tune the home page and connect Google Search Console.</p>
        <div class="form-grid">
          <div class="field full"><label>Home page title in Google <span class="muted" data-count-for="seo_title"></span></label><input name="seo_title" maxlength="70" value="${esc(s.seo_title || '')}" placeholder="${esc((s.business_name || '').replace(/,?\s+LLC$/i, ''))} — RV Rentals, RV Sites & Campgrounds in Florida"></div>
          <div class="field full"><label>Home page description in Google <span class="muted" data-count-for="seo_description"></span></label><textarea name="seo_description" maxlength="300" style="min-height:80px" placeholder="Rent a road-ready RV, book a full-hookup RV site at our Florida campgrounds, or buy an RV or deeded RV lot. Instant online booking.">${esc(s.seo_description || '')}</textarea></div>
          <div class="field full"><label>Google Search Console verification code</label><input name="google_site_verification" value="${esc(s.google_site_verification || '')}" placeholder="Paste the code, or the whole &lt;meta name=&quot;google-site-verification&quot; …&gt; tag">
            <p class="small muted" style="margin:.35rem 0 0">In Search Console choose <em>URL prefix</em> → <em>HTML tag</em>, paste it here, save, then click Verify in Google.</p></div>
        </div>
        <div class="serp" aria-label="Google preview"><span class="serp-url">${esc(location.host)}</span><span class="serp-title" id="serpTitle"></span><span class="serp-desc" id="serpDesc"></span></div>
        <p class="small muted" style="margin:.75rem 0 0">Sitemap for Google: <a href="/sitemap.xml" target="_blank">${esc(location.origin)}/sitemap.xml</a> · <a href="/robots.txt" target="_blank">robots.txt</a></p>
      </div>
      <div class="panel"><h3>Policies</h3><div class="form-grid">${area('rental_policy', 'RV rental terms')}${area('site_policy', 'RV site rules')}${area('cancellation_policy', 'Cancellation policy')}</div></div>
      <div class="panel"><h3>Resort amenities</h3><div class="field"><label>One per line</label><textarea name="amenities_text" style="min-height:180px">${esc((s.amenities || []).join('\n'))}</textarea></div></div>
      <div class="panel"><h3>FAQ</h3><div id="faqRep"></div></div>
      <div><button class="btn btn-primary">Save settings</button></div>
    </form>
    <form id="pwForm" class="panel" style="margin-top:1.25rem;max-width:520px"><h3>Change your password</h3>
      <div class="field"><label>Current password</label><input type="password" name="current" required autocomplete="current-password"></div>
      <div class="field"><label>New password (10+ characters)</label><input type="password" name="next" required minlength="10" autocomplete="new-password"></div>
      <button class="btn btn-dark">Update password</button></form>`;
    const addonCols = [{ key: 'name', label: 'Name', width: '2fr' }, { key: 'price', label: 'Price', type: 'number', width: '110px' }, { key: 'per', type: 'select', options: [['stay', 'per stay'], ['night', 'per night']], width: '130px' }];
    const getRv = repeater($('#rvAdd'), addonCols, s.rv_addons || []);
    const getLot = repeater($('#lotAdd'), addonCols, s.lot_addons || []);
    const RG = window.RFRegions;
    const getLoc = repeater($('#locRep'), [
      { key: 'state', type: 'select', options: Object.keys(RG.STATES).map(c => [c, RG.STATES[c]]), width: '150px' },
      { key: 'role', type: 'select', options: RG.ROLES.map(r => [r, r]), width: '140px' },
      { key: 'city', label: 'City (optional)' }, { key: 'phone', label: 'Phone (optional)', width: '140px' },
      { key: 'blurb', label: 'Short description for the website', type: 'textarea', width: '2fr' }], s.locations || []);
    const getFaq = repeater($('#faqRep'), [{ key: 'q', label: 'Question' }, { key: 'a', label: 'Answer', type: 'textarea', width: '2fr' }], s.faq || []);
    $('#sForm').onsubmit = async ev => {
      ev.preventDefault();
      const d = formData(ev.target);
      const body = { ...d, tax_rate: Number(d.tax_pct) / 100, amenities: d.amenities_text.split('\n').map(x => x.trim()).filter(Boolean), rv_addons: getRv(), lot_addons: getLot(), faq: getFaq(), locations: getLoc() };
      delete body.tax_pct; delete body.amenities_text;
      try { await api('/settings', { method: 'PUT', body }); toast('Settings saved'); settings(); }
      catch (e) { toast(e.message, true); }
    };
    emailStatus();
    const sf = $('#sForm');
    const serp = () => {
      const title = sf.seo_title.value.trim() || sf.seo_title.placeholder, desc = sf.seo_description.value.trim() || sf.seo_description.placeholder;
      $('#serpTitle').textContent = title.length > 60 ? title.slice(0, 59) + '…' : title;
      $('#serpDesc').textContent = desc.length > 160 ? desc.slice(0, 159) + '…' : desc;
      for (const [k, ideal] of [['seo_title', 60], ['seo_description', 160]]) {
        const n = sf[k].value.trim().length, el = $(`[data-count-for="${k}"]`);
        el.textContent = n ? `· ${n}/${ideal} characters${n > ideal ? ' (may be cut off)' : ''}` : '· using the default';
      }
    };
    sf.seo_title.oninput = sf.seo_description.oninput = serp; serp();
    $('#pwForm').onsubmit = async ev => {
      ev.preventDefault();
      try { await api('/password', { method: 'POST', body: formData(ev.target) }); ev.target.reset(); toast('Password updated'); }
      catch (e) { toast(e.message, true); }
    };
  }

  async function emailStatus() {
    const box = $('#emailStatus');
    if (!box) return;
    let e;
    try { e = await api('/email'); } catch (er) { box.innerHTML = `<div class="alert alert-error">${esc(er.message)}</div>`; return; }
    const when = ts => { const d = new Date(String(ts).replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
    box.innerHTML = `
      ${e.enabled ? `<div class="alert alert-ok">Email is on. Guests receive messages from <strong>${esc(e.from)}</strong>.${e.reply_to ? ` When guests reply, it goes to <strong>${esc(e.reply_to)}</strong>.` : ''} Staff alerts go to <strong>${esc(e.staff_to || 'nobody yet')}</strong>.</div>
        ${!e.reply_to || !e.staff_to ? `<div class="alert alert-warn">${!e.reply_to ? 'Your business email (Business → Email) is still the placeholder, so guest replies have nowhere to go. ' : ''}${!e.staff_to ? 'Add a staff notification email above to receive alerts for new bookings, cancellations, inquiries and chats.' : ''}</div>` : ''}`
        : '<div class="alert alert-warn">Email is off. Add <code>RESEND_API_KEY</code> to the <code>.env</code> file and restart the server.</div>'}
      <div class="row" style="grid-template-columns:minmax(0,1fr) auto;align-items:end;margin-bottom:1.25rem">
        <div class="field" style="margin:0"><label>Send a test email to</label><input id="testTo" type="email" value="${esc(e.staff_to || e.user_email)}"></div>
        <button class="btn btn-dark" type="button" id="testBtn" ${e.enabled ? '' : 'disabled'}>Send test</button>
      </div>
      <h4 style="font-family:var(--font);font-size:.85rem;margin:0 0 .5rem">Recent emails</h4>
      ${e.log.length ? `<div class="table-wrap" style="box-shadow:none"><table class="tbl"><thead><tr><th>When</th><th>To</th><th>Subject</th><th>Status</th></tr></thead><tbody>
        ${e.log.map(l => `<tr><td class="small" style="white-space:nowrap">${when(l.created_at)}</td><td class="small">${esc(l.recipient)}</td><td class="small">${esc(l.subject)}</td>
          <td>${l.status === 'sent' ? pill('confirmed').replace('>confirmed<', '>sent<') : `<span class="status-pill st-cancelled" title="${esc(l.error || '')}">${esc(l.status)}</span>`}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="small muted">No emails sent yet.</p>'}`;
    $('#testBtn').onclick = async ev => {
      ev.currentTarget.disabled = true;
      try { await api('/email/test', { method: 'POST', body: { to: $('#testTo').value } }); toast('Test email sent — check your inbox'); emailStatus(); }
      catch (er) { toast(er.message, true); $('#testBtn').disabled = false; }
    };
  }

  // ---------------- live chat ----------------
  const CHAT = { active: false, id: null, lastId: 0, latest: null, unread: 0, list: [], refresh: null, away: false };
  const chatTime = ts => { const d = new Date(String(ts).replace(' ', 'T') + 'Z'); if (isNaN(d)) return ''; const today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const chatText = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
  const chatMsg = m => m.sender === 'system'
    ? `<div class="chat-msg system"><div class="bubble">${chatText(m.body)}</div></div>`
    : `<div class="chat-msg ${m.sender === 'guest' ? 'guest' : 'staff'}"><div class="bubble">${chatText(m.body)}</div><time>${m.sender === 'staff' ? 'You · ' : ''}${chatTime(m.created_at)}</time></div>`;
  function ding() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)(), o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.setValueAtTime(.08, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .35);
      o.start(); o.stop(ctx.currentTime + .36);
    } catch {}
  }
  const baseTitle = document.title;
  async function pulse() {
    try {
      const p = await api('/chats/pulse');
      CHAT.away = p.away;
      if (CHAT.latest !== null && p.latest > CHAT.latest && p.unread > CHAT.unread) {
        ding();
        if (!CHAT.active) toast('New live chat message — open Live Chat to reply');
      }
      CHAT.unread = p.unread; CHAT.latest = p.latest;
      counts.unread_chats = p.waiting; setCounts();
      document.title = p.unread ? `(${p.unread}) New chat · ${baseTitle}` : baseTitle;
      if (CHAT.active && CHAT.refresh) await CHAT.refresh();
      const pres = $('#presence');
      if (pres) { pres.classList.toggle('on', p.online); pres.querySelector('span').textContent = p.away ? 'Away' : 'Online for chat'; pres.querySelector('button').textContent = p.away ? 'Go online' : 'Set away'; }
    } catch {}
  }

  async function chatView() {
    $('#vActions').innerHTML = `<div class="presence ${CHAT.away ? '' : 'on'}" id="presence"><i></i><span>${CHAT.away ? 'Away' : 'Online for chat'}</span><button class="btn btn-ghost btn-sm" type="button">${CHAT.away ? 'Go online' : 'Set away'}</button></div>`;
    $('#presence button').onclick = async () => { try { const r = await api('/chats/presence', { method: 'POST', body: { away: !CHAT.away } }); CHAT.away = r.away; toast(r.away ? 'You are away — guests will be asked to leave a message.' : 'You are online for live chat.'); pulse(); } catch (e) { toast(e.message, true); } };
    $('#view').innerHTML = `<p class="small muted" style="margin:-.5rem 0 1rem">Guests see you as <strong>online</strong> while this back office is open (and you aren’t set to away). New messages play a sound and show a badge.</p>
      <div class="inbox" id="inboxEl"><div class="inbox-list" id="chatList"></div><div class="inbox-thread" id="chatThread"><div class="inbox-empty"><div><h3>No conversation selected</h3><p>Pick a chat on the left to read and reply.</p></div></div></div></div>`;
    const drawList = () => {
      $('#chatList').innerHTML = CHAT.list.length ? CHAT.list.map(c => `<button type="button" class="inbox-item ${c.id === CHAT.id ? 'active' : ''} ${c.unread_staff ? 'unread' : ''}" data-id="${c.id}">
          <div class="top"><strong>${esc(c.name)}</strong><time>${chatTime(c.updated_at)}</time></div>
          <p>${c.last_sender === 'staff' ? 'You: ' : ''}${esc(c.last_body || '')}</p>
          <div class="tags">${c.topic ? `<span class="tag">${esc(c.topic)}</span>` : ''}${c.callback ? '<span class="tag cb">Call back</span>' : ''}${c.status === 'closed' ? '<span class="tag">Resolved</span>' : ''}${c.unread_staff ? `<span class="tag cb">${c.unread_staff} new</span>` : ''}</div>
        </button>`).join('') : '<div class="inbox-empty"><div><h3>No chats yet</h3><p>Conversations from the website chat bubble appear here.</p></div></div>';
      $$('#chatList [data-id]').forEach(b => b.onclick = () => openThread(Number(b.dataset.id)));
    };
    const loadList = async () => { CHAT.list = await api('/chats'); drawList(); };

    async function openThread(id) {
      CHAT.id = id; CHAT.lastId = 0;
      $('#inboxEl').classList.add('has-thread');
      const c = await api(`/chats/${id}`);
      CHAT.lastId = c.messages.at(-1)?.id || 0;
      const transcript = c.messages.filter(m => m.sender !== 'system').map(m => `${m.sender === 'guest' ? c.name : 'STAYCAMPRV'}: ${m.body}`).join('\n');
      const mailto = `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent('Re: your chat with STAYCAMPRV LLC')}&body=${encodeURIComponent(`Hi ${c.name.split(' ')[0]},\n\n\n\n— Your conversation —\n${transcript}`)}`;
      $('#chatThread').innerHTML = `
        <div class="inbox-thread-head">
          <div><button type="button" class="back-link" id="chatBack">← All chats</button>
            <h3>${esc(c.name)} ${c.status === 'closed' ? pill('closed') : ''}</h3>
            <div class="meta"><a href="${mailto}">${esc(c.email)}</a>${c.phone ? ` · <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''}${c.topic ? ` · ${esc(c.topic)}` : ''}${c.callback ? ' · <strong style="color:var(--warn)">Call back requested</strong>' : ''}<br>Started ${fmtDate(c.created_at)} ${chatTime(c.created_at)}${c.page ? ` from <code>${esc(c.page)}</code>` : ''}</div></div>
          <div class="actions">
            <a class="btn btn-ghost btn-sm" href="${mailto}">Reply by email</a>
            <button class="btn btn-ghost btn-sm" id="chatStatus">${c.status === 'closed' ? 'Reopen' : 'Mark resolved'}</button>
            <button class="btn btn-danger btn-sm" id="chatDel">Delete</button>
          </div>
        </div>
        <div class="inbox-messages" id="chatMsgs">${c.messages.map(chatMsg).join('')}</div>
        <div class="inbox-reply">
          <div class="quick-replies">${['Thanks for reaching out! Let me check that for you.', 'Could you share your booking confirmation code?', `You can see live availability and book here: ${location.origin}/rentals`, 'I’ll give you a call in a few minutes.', 'Is there anything else I can help with?'].map(q => `<button type="button">${esc(q)}</button>`).join('')}</div>
          <form class="chat-compose" id="chatForm"><textarea rows="1" placeholder="Reply to ${esc(c.name.split(' ')[0])}…" title="Enter to send · Shift+Enter for a new line" aria-label="Reply"></textarea><button class="chat-send" type="submit" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg></button></form>
        </div>`;
      const msgs = $('#chatMsgs'); msgs.scrollTop = msgs.scrollHeight;
      const form = $('#chatForm'), ta = $('textarea', form);
      const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; };
      ta.oninput = grow;
      ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } };
      $$('.quick-replies button').forEach(b => b.onclick = () => { ta.value = ta.value ? ta.value + ' ' + b.textContent : b.textContent; grow(); ta.focus(); });
      form.onsubmit = async e => {
        e.preventDefault();
        const text = ta.value.trim(); if (!text) return;
        ta.value = ''; grow();
        try { const m = await api(`/chats/${id}/messages`, { method: 'POST', body: { body: text } }); if (m.id > CHAT.lastId) { CHAT.lastId = m.id; msgs.insertAdjacentHTML('beforeend', chatMsg(m)); msgs.scrollTop = msgs.scrollHeight; } loadList(); }
        catch (er) { ta.value = text; toast(er.message, true); }
      };
      $('#chatBack').onclick = () => { CHAT.id = null; $('#inboxEl').classList.remove('has-thread'); drawList(); };
      $('#chatStatus').onclick = async () => { try { await api(`/chats/${id}`, { method: 'PATCH', body: { status: c.status === 'closed' ? 'open' : 'closed' } }); await loadList(); openThread(id); } catch (er) { toast(er.message, true); } };
      $('#chatDel').onclick = async () => { if (!confirm(`Delete the chat with ${c.name}? This can’t be undone.`)) return; try { await api(`/chats/${id}`, { method: 'DELETE' }); CHAT.id = null; $('#inboxEl').classList.remove('has-thread'); $('#chatThread').innerHTML = '<div class="inbox-empty"><div><h3>Chat deleted</h3></div></div>'; loadList(); } catch (er) { toast(er.message, true); } };
      drawList();
      ta.focus();
    }

    CHAT.refresh = async () => {
      if (!$('#chatList')) return;
      await loadList();
      if (CHAT.id && $('#chatMsgs')) {
        const c = await api(`/chats/${CHAT.id}?after=${CHAT.lastId}`);
        const msgs = $('#chatMsgs');
        if (c.messages.length && msgs) { msgs.insertAdjacentHTML('beforeend', c.messages.map(chatMsg).join('')); CHAT.lastId = c.messages.at(-1).id; msgs.scrollTop = msgs.scrollHeight; }
      }
    };
    await loadList();
    const first = CHAT.id && CHAT.list.find(c => c.id === CHAT.id) ? CHAT.id : (window.innerWidth > 900 ? CHAT.list.find(c => c.status !== 'closed')?.id : null);
    if (first) await openThread(first);
  }

  // ---------------- boot ----------------
  async function start() {
    try { SCHEMA = await api('/schema'); } catch { return; }
    shell();
    await refreshCounts();
    route();
    pulse();
    clearInterval(CHAT.timer);
    CHAT.timer = setInterval(pulse, 4000);
  }
  (async () => {
    try { USER = await api('/auth/me', { raw: true }); start(); }
    catch { showLogin(); }
  })();
})();
