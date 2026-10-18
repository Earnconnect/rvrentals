// STAYCAMPRV live chat widget: instant answers from the FAQ, live chat with staff, and offline messages answered by email.
(() => {
  const KEY = 'rf_chat';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
  const timeOf = ts => { const d = new Date(String(ts).replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
  const save = v => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} };

  const st = { open: false, view: 'home', session: load(), messages: [], lastId: 0, online: false, settings: {}, unread: 0, timer: null, sending: false, answers: [] };

  async function call(path, { method = 'GET', body } = {}) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (st.session?.token) headers['X-Chat-Token'] = st.session.token;
    const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Please try again.'); e.status = res.status; throw e; }
    return data;
  }

  const ICON = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1121 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>'
  };

  const root = document.createElement('div');
  root.className = 'chat-root';
  root.innerHTML = `
    <button class="chat-launcher" type="button" aria-label="Open chat support" aria-expanded="false">
      <span class="chat-launcher-icon">${ICON.chat}</span><span class="chat-launcher-label">Chat with us</span>
      <span class="chat-dot" aria-hidden="true"></span><span class="chat-badge hidden" aria-live="polite"></span>
    </button>
    <section class="chat-panel" role="dialog" aria-modal="false" aria-label="STAYCAMPRV support chat" hidden>
      <header class="chat-head">
        <img src="/img/logo-mark.svg" alt="" width="40" height="40">
        <div class="chat-head-text"><strong>STAYCAMPRV Support</strong><span class="chat-status"></span></div>
        <button class="chat-icon-btn chat-close" type="button" aria-label="Close chat">${ICON.close}</button>
      </header>
      <div class="chat-body"></div>
      <footer class="chat-foot"></footer>
    </section>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const launcher = $('.chat-launcher'), panel = $('.chat-panel'), body = $('.chat-body'), foot = $('.chat-foot');

  function setStatus() {
    root.classList.toggle('is-online', st.online);
    $('.chat-status').innerHTML = st.online
      ? '<i class="on"></i>Online now · replies in minutes'
      : '<i></i>Away · we’ll reply by email';
    const badge = $('.chat-badge');
    badge.textContent = st.unread;
    badge.classList.toggle('hidden', !st.unread || st.open);
  }

  // ---------- home view: instant answers + start form ----------
  function drawHome(topic = '') {
    st.view = 'home';
    const faq = (st.settings.faq || []).slice(0, 6);
    body.innerHTML = `
      <div class="chat-hello">
        <h3>Hi there 👋</h3>
        <p>${st.online ? 'Our team is online. Ask us anything about rentals, RV sites or buying.' : `We’re away right now, but leave a message and we’ll get back to you by email${st.settings.hours ? ` (office hours: ${esc(st.settings.hours)})` : ''}.`}</p>
      </div>
      <div class="chat-quick">
        <a href="/manage" data-close>${ICON.cal}<span>Manage my booking</span></a>
        ${st.settings.email ? `<a href="mailto:${esc(st.settings.email)}">${ICON.mail}<span>Email bookings</span></a>` : ''}
        ${st.settings.support_email ? `<a href="mailto:${esc(st.settings.support_email)}">${ICON.mail}<span>Email support</span></a>` : ''}
      </div>
      ${faq.length ? `<div class="chat-section-label">Instant answers</div>
        <div class="chat-faq">${faq.map((f, i) => `<button type="button" data-faq="${i}">${esc(f.q)}</button>`).join('')}</div>
        <div class="chat-answers">${st.answers.map(i => `<div class="chat-msg guest"><div class="bubble">${esc(faq[i]?.q)}</div></div>
          <div class="chat-msg staff bot"><span class="who">Instant answer</span><div class="bubble">${linkify(faq[i]?.a)}</div></div>`).join('')}</div>` : ''}
      <div class="chat-section-label">${st.online ? 'Chat with our team' : 'Leave us a message'}</div>
      <form class="chat-start" novalidate>
        <div class="chat-err"></div>
        <div class="chat-row"><input name="name" placeholder="Your name" autocomplete="name" required><input name="email" type="email" placeholder="Email" autocomplete="email" required></div>
        <select name="topic" aria-label="Topic">${['', 'RV rental', 'RV site / resort stay', 'Buying an RV or lot', 'An existing booking', 'Something else'].map(t => `<option value="${t}" ${t === topic ? 'selected' : ''}>${t || 'What can we help with?'}</option>`).join('')}</select>
        <textarea name="message" rows="3" placeholder="How can we help?" required></textarea>
        <button class="btn btn-primary btn-block" type="submit">${st.online ? 'Start chat' : 'Send message'}</button>
        <p class="chat-fine">We reply here and by email. By starting a chat you agree we can contact you about your request. <a href="/legal/privacy" data-close>Privacy Policy</a></p>
      </form>`;
    foot.innerHTML = '';
    foot.classList.add('hidden');
    const form = $('.chat-start');
    body.querySelectorAll('[data-faq]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.faq);
      st.answers = [...st.answers.filter(x => x !== i), i];
      drawHome(form.topic.value);
      const a = body.querySelector('.chat-answers');
      a?.lastElementChild?.scrollIntoView({ block: 'nearest' });
    });
    body.querySelectorAll('[data-close]').forEach(a => a.addEventListener('click', () => toggle(false)));
    form.onsubmit = async ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(form).entries());
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const r = await call('/chat/start', { method: 'POST', body: { ...f, page: location.pathname + location.search } });
        st.session = { token: r.token, name: f.name };
        save(st.session);
        st.online = r.online; st.messages = r.messages; st.lastId = r.messages.at(-1)?.id || 0;
        drawChat();
      } catch (e) {
        form.querySelector('.chat-err').innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`;
        btn.disabled = false; btn.textContent = st.online ? 'Start chat' : 'Send message';
      }
    };
  }

  // ---------- chat view ----------
  const msgHtml = m => m.sender === 'system'
    ? `<div class="chat-msg system" data-id="${m.id}"><div class="bubble">${linkify(m.body)}</div></div>`
    : `<div class="chat-msg ${m.sender === 'guest' ? 'guest' : 'staff'}" data-id="${m.id}">${m.sender === 'staff' ? '<span class="who">STAYCAMPRV team</span>' : ''}<div class="bubble">${linkify(m.body)}</div><time>${timeOf(m.created_at)}</time></div>`;

  function drawChat() {
    st.view = 'chat';
    body.innerHTML = `<div class="chat-thread">${st.messages.map(msgHtml).join('')}</div>`;
    foot.classList.remove('hidden');
    foot.innerHTML = `<form class="chat-compose"><textarea rows="1" placeholder="Type your message…" aria-label="Message" maxlength="2000"></textarea>
      <button type="submit" class="chat-send" aria-label="Send">${ICON.send}</button></form>
      <div class="chat-foot-links"><span>${st.online ? 'Team online' : 'We’ll also reply by email'}</span><button type="button" class="chat-end">End chat</button></div>`;
    const form = foot.querySelector('form'), ta = form.querySelector('textarea');
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; };
    ta.oninput = grow;
    ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } };
    form.onsubmit = async e => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text || st.sending) return;
      st.sending = true; ta.value = ''; grow();
      try { const m = await call('/chat/messages', { method: 'POST', body: { body: text } }); append([m]); }
      catch (err) { ta.value = text; showError(err); }
      st.sending = false; ta.focus();
    };
    foot.querySelector('.chat-end').onclick = () => {
      if (!confirm('End this chat? You can start a new one anytime. Replies will still reach you by email.')) return;
      st.session = null; st.messages = []; st.lastId = 0; st.unread = 0; save(null); drawHome(); setStatus();
    };
    scrollDown();
    if (st.open) setTimeout(() => ta.focus(), 50);
  }
  function append(list) {
    const thread = body.querySelector('.chat-thread');
    for (const m of list) {
      if (m.id <= st.lastId && st.messages.some(x => x.id === m.id)) continue;
      st.messages.push(m); st.lastId = Math.max(st.lastId, m.id);
      thread?.insertAdjacentHTML('beforeend', msgHtml(m));
    }
    scrollDown();
  }
  const scrollDown = () => { body.scrollTop = body.scrollHeight; };
  function showError(err) {
    if (err.status === 404) { st.session = null; save(null); drawHome(); return; }
    body.querySelector('.chat-thread')?.insertAdjacentHTML('beforeend', `<div class="chat-msg system"><div class="bubble">${esc(err.message)}</div></div>`);
    scrollDown();
  }

  // ---------- polling ----------
  async function poll() {
    try {
      if (st.session) {
        const seen = st.open && st.view === 'chat';
        const r = await call(`/chat/messages?after=${st.lastId}${seen ? '&seen=1' : ''}`);
        st.online = r.online; st.unread = r.unread;
        if (r.messages.length) { if (st.view === 'chat') append(r.messages); else { st.messages.push(...r.messages); st.lastId = r.messages.at(-1).id; } }
      } else {
        const r = await call('/chat/status'); st.online = r.online;
      }
    } catch (e) { if (e.status === 404) { st.session = null; save(null); if (st.view === 'chat') drawHome(); } }
    setStatus();
    schedule();
  }
  function schedule() {
    clearTimeout(st.timer);
    const ms = st.session ? (st.open ? 3000 : 15000) : (st.open ? 15000 : 60000);
    st.timer = setTimeout(poll, document.hidden ? Math.max(ms, 30000) : ms);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  // ---------- open / close ----------
  function toggle(open = !st.open, topic) {
    st.open = open;
    panel.hidden = !open;
    root.classList.toggle('open', open);
    launcher.setAttribute('aria-expanded', open);
    document.documentElement.classList.toggle('chat-locked', open && matchMedia('(max-width: 520px)').matches);
    if (open) {
      if (st.session) { if (st.view !== 'chat' || !body.querySelector('.chat-thread')) loadThread(); else { scrollDown(); foot.querySelector('textarea')?.focus(); } }
      else drawHome(topic);
      st.unread = 0;
      poll();
    } else schedule();
    setStatus();
  }
  async function loadThread() {
    body.innerHTML = '<div class="chat-loading">Loading your conversation…</div>';
    try {
      const r = await call('/chat/messages?after=0&seen=1');
      st.online = r.online; st.messages = r.messages; st.lastId = r.messages.at(-1)?.id || 0;
      drawChat();
    } catch (e) { st.session = null; save(null); drawHome(); }
    setStatus();
  }
  launcher.onclick = () => toggle();
  $('.chat-close').onclick = () => toggle(false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.open) toggle(false); });

  window.RFChat = { open: topic => toggle(true, topic) };

  (async () => {
    st.settings = window.RF_SETTINGS || await call('/settings').catch(() => st.settings);
    await poll();
  })();
})();
