// Blue Gecko CMS — public website shared shell.
// Loaded on every page after config.js. No build step, no framework —
// plain functions attached to `window.bg`, called from each page's own
// small inline <script> at the bottom of its HTML.

(function () {
  const CFG = window.BG_SITE;

  // ---- API client -------------------------------------------------
  // Thin wrapper over the three public endpoints documented in
  // README.md's "Public website API" section. No auth — these are all
  // GETs against /v1/public/:slug/...
  async function apiGet(path) {
    const res = await fetch(CFG.API_BASE + path);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || ('Request failed: ' + res.status));
    }
    return res.json();
  }
  async function apiPost(path, body) {
    const res = await fetch(CFG.API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('Request failed: ' + res.status));
    return data;
  }

  const api = {
    listings(params) {
      const qs = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, v);
      });
      const suffix = qs.toString() ? '?' + qs.toString() : '';
      return apiGet('/public/' + CFG.SLUG + '/listings' + suffix).then((r) => r.listings);
    },
    listing(id) {
      // Release G (21/10/2026): the CMS counts a property page view each
      // time a property is loaded. Only the Property page is a view; other
      // pages that load the property (Booking Request) say so with count=0.
      const isPropertyPage = /\/property(\.html)?$/.test(location.pathname);
      const suffix = isPropertyPage ? '' : '?count=0';
      return apiGet('/public/' + CFG.SLUG + '/listings/' + encodeURIComponent(id) + suffix).then((r) => r.listing);
    },
    // Unavailable nights + booking rules for the date picker (Release A 2b,
    // 14/10/2026): { from, to, busy: [{start, end (exclusive)}], rules }.
    unavailable(id, from, to) {
      return apiGet('/public/' + CFG.SLUG + '/listings/' + encodeURIComponent(id) + '/unavailable?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to));
    },
    specialOffers() {
      return apiGet('/public/' + CFG.SLUG + '/special-offers').then((r) => r.special_offers);
    },
    specialOffersIntro() {
      return apiGet('/public/' + CFG.SLUG + '/special-offers-intro').then((r) => r.special_offers_intro_text);
    },
    tags() {
      return apiGet('/public/tags').then((r) => r.tags);
    },
    about() {
      return apiGet('/public/' + CFG.SLUG + '/about');
    },
    home() {
      return apiGet('/public/' + CFG.SLUG + '/home');
    },
    submitEnquiry(payload) {
      return apiPost('/public/' + CFG.SLUG + '/enquiries', payload);
    },
    submitBookingRequest(payload) {
      return apiPost('/public/' + CFG.SLUG + '/booking-requests', payload);
    },
    branding() {
      return apiGet('/public/' + CFG.SLUG + '/branding');
    },
    quote(listingId, startDate, endDate) {
      const qs = new URLSearchParams({ start_date: startDate, end_date: endDate });
      return apiGet('/public/' + CFG.SLUG + '/listings/' + encodeURIComponent(listingId) + '/quote?' + qs.toString());
    },
  };

  // ---- Branding cache -------------------------------------------------
  // 10/09/2026: this is a traditional multi-page site — every nav click is
  // a full page load, not an SPA — so without this, EVERY page load
  // rendered config.js's generic defaults (CSS default colour, no logo,
  // placeholder org name) and then visibly swapped to the tenant's real
  // branding a moment later, once GET /public/:slug/branding resolved.
  // That's a flash on every single click, not just first load. Caching the
  // last-known-good branding per tenant (keyed by SLUG, so switching
  // between test tenants in the same browser — see Customers-staging/ —
  // never shows one tenant's cached values on another's site) lets each
  // new page apply the real values immediately, before the network fetch
  // even starts; the fetch below still always runs and still always wins
  // if it disagrees with the cache (a real branding change, or no cache
  // yet), it just usually finds nothing to change. First-ever visit on a
  // browser with no cache still shows one brief default-then-real flash —
  // that part needs server-side rendering to fully remove, which is a
  // bigger change than this — but that only happens once per device, not
  // on every navigation.
  function readBrandingCache() {
    try {
      return JSON.parse(localStorage.getItem('bg_branding_' + CFG.SLUG) || 'null');
    } catch (e) {
      return null; // e.g. private browsing with storage disabled — just skip the cache
    }
  }
  function writeBrandingCache(b) {
    try {
      localStorage.setItem('bg_branding_' + CFG.SLUG, JSON.stringify({
        org_name: b.org_name || null,
        logo_url: b.logo_url || null,
        accent_color: b.accent_color || null,
        contact_email: b.contact_email || null,
        contact_phone: b.contact_phone || null,
        whatsapp_number: b.whatsapp_number || null,
      }));
    } catch (e) { /* e.g. storage full/disabled — next page just misses the cache */ }
  }

  // ---- Header / footer ---------------------------------------------
  // Website editions (20/11/2026): a site may set its own menu in config.js
  // (BG_SITE.NAV, e.g. the Mini template); otherwise the Standard menu.
  const NAV = (CFG && Array.isArray(CFG.NAV) && CFG.NAV.length) ? CFG.NAV : [
    { href: 'index.html', label: 'Home' },
    { href: 'search.html', label: 'Search' },
    { href: 'special-offers.html', label: 'Special Offers' },
    { href: 'calendar.html', label: 'Calendar' },
    { href: 'about.html', label: 'About us' },
    { href: 'contact.html', label: 'Contact' },
  ];

  function brandMarkHtml(logoUrl) {
    return logoUrl
      ? `<img class="brand-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(CFG.ORG_NAME)}">${escapeHtml(CFG.ORG_NAME)}`
      : escapeHtml(CFG.ORG_NAME);
  }

  // Mutates the shared CFG.ORG_NAME in place (31/08/2026) so every later
  // read of it — thumbHtml's no-photo placeholder, cardHtml, etc. — picks
  // up the real name too, then updates the two places already rendered
  // synchronously before this fetch could have resolved: the page
  // <title> tail and the footer's copyright line. The brand mark itself
  // is re-rendered by renderHeader's own branding-fetch callback right
  // after calling this, so it isn't touched here.
  function applyOrgName(name) {
    CFG.ORG_NAME = name;
    if (document.title.indexOf(' — ') !== -1) {
      document.title = document.title.replace(/ — .+$/, ' — ' + CFG.ORG_NAME);
    }
    // Anywhere a page quotes the organisation's name inline (e.g. the
    // marketing tick box on the booking form).
    document.querySelectorAll('[data-org-name]').forEach((n) => { n.textContent = CFG.ORG_NAME; });
    const footerCopy = document.querySelector('#site-footer .footer-copy');
    if (footerCopy) footerCopy.textContent = CFG.ORG_NAME + ' © ' + new Date().getFullYear();
  }

  function renderHeader(activePage) {
    const el = document.getElementById('site-header');
    if (!el) return;
    const links = NAV.map(
      (n) => `<a href="${n.href}"${n.href === activePage ? ' class="active"' : ''}>${n.label}</a>`
    ).join('');

    // Use whatever real branding this browser already has cached for this
    // tenant (see the Branding cache section above) instead of config.js's
    // generic defaults, so a page nav doesn't flash the wrong colour/logo/
    // name before the fetch below corrects it a moment later. Applying the
    // cached org name here (via applyOrgName) also fixes the page <title>
    // and, since renderFooter() always runs right after this on every
    // page, the footer copyright line too — both pick up the corrected
    // CFG.ORG_NAME before they render.
    const cached = readBrandingCache();
    if (cached && cached.org_name) applyOrgName(cached.org_name);
    if (cached && cached.accent_color) {
      document.documentElement.style.setProperty('--header-footer-bg', cached.accent_color);
    }
    const initialLogo = (cached && cached.logo_url) || CFG.LOGO_URL;

    // Render immediately (with the cached or config.js logo — see above)
    // so the header never waits on a network round trip — then upgrade to
    // the CMS-managed logo (Organisation screen, 03/09/2026 rename — was
    // "Logo & Emails") once it's back, which takes priority when set.
    el.innerHTML = `
      <div class="bar">
        <a class="brand" href="index.html">${brandMarkHtml(initialLogo)}</a>
        <nav>${links}</nav>
      </div>`;

    // Same upgrade approach for the tenant's real organisation name
    // (31/08/2026) — config.js's ORG_NAME renders immediately below as the
    // pre-fetch/fallback text, then this swaps in the CMS's own
    // `clients.name` once it's back, everywhere ORG_NAME already appears
    // (brand mark, page <title>, footer copy — see applyOrgName below).
    api.branding()
      .then((b) => {
        if (!b) return;
        // Diff against what was actually painted above (the cache, or
        // config.js's static defaults on a first-ever visit) before
        // touching the DOM — not just "did the fetch return a value".
        // Safari visibly repaints an <img> (a brief flash) on every
        // innerHTML replace even when the src is byte-for-byte identical
        // to what's already there, which is why the logo kept "flickering"
        // on Safari specifically even once the cache was warm and the
        // fetched value never actually changed (11/09/2026, DG report —
        // reproduced on Safari, not on Chromium-based browsers). Skipping
        // a no-op write fixes that outright, and is cheaper besides.
        const prevLogo = (cached && cached.logo_url) || null;
        const prevOrgName = (cached && cached.org_name) || null;
        const prevAccent = (cached && cached.accent_color) || null;
        writeBrandingCache(b);
        if (b.org_name && b.org_name !== prevOrgName) applyOrgName(b.org_name);
        const newLogo = b.logo_url || CFG.LOGO_URL;
        if ((b.logo_url || b.org_name) && newLogo !== prevLogo) {
          const brandEl = el.querySelector('.brand');
          if (brandEl) brandEl.innerHTML = brandMarkHtml(newLogo);
        }
        // Header/footer background upgrades to the tenant's chosen colour
        // the same way the logo/name do (03/09/2026) — same colour as the
        // branded emails, applied only to --header-footer-bg (see
        // site.css's :root comment) so it doesn't also recolour links,
        // CTAs and price text elsewhere on the site. No accent_color means
        // the tenant hasn't picked one yet — leave the CSS default in
        // place rather than writing over it. Each page's own <head> (see
        // any page's <script> right after config.js) already applied
        // config.js's static ACCENT_COLOR fallback before this fetch even
        // started, to avoid a flash of the CSS default while this network
        // round trip is in flight — this call just re-confirms/corrects
        // that value from the CMS's own record, a no-op when the two
        // already match (and, as of 11/09/2026, skipped outright when
        // they already match, for the same Safari-repaint reason above).
        if (b.accent_color && b.accent_color !== prevAccent) {
          document.documentElement.style.setProperty('--header-footer-bg', b.accent_color);
        }
        // Trustpilot footer link (03/09/2026) — site-wide, a simple link
        // rather than the official TrustBox widget, per David's request.
        // #footer-trustpilot lives in the footer bar (renderFooter, called
        // on every page alongside renderHeader) — it may not exist yet if
        // this callback resolves before renderFooter runs, so re-query
        // rather than relying on a reference captured earlier. A
        // trustpilot_badge_url (03/09/2026 addition) upgrades the plain
        // text link to the tenant's own badge image — more visible than
        // text, per David's follow-up request — wrapped in the same link;
        // no badge image just keeps the text link.
        if (b.trustpilot_url) {
          const tpEl = document.getElementById('footer-trustpilot');
          if (tpEl) {
            const inner = b.trustpilot_badge_url
              ? `<img class="trustpilot-badge" src="${escapeHtml(b.trustpilot_badge_url)}" alt="Trustpilot reviews">`
              : 'Read our reviews on Trustpilot';
            tpEl.innerHTML = `<a href="${escapeHtml(b.trustpilot_url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
          }
        }
        // Footer centre (Release A, 14/10/2026): logo, then the contact
        // email and telephone from the Organisation screen. Re-rendered
        // only when something differs from what the cache already painted
        // (same Safari-repaint reason as the header logo above).
        const orgEl = document.getElementById('footer-org');
        const prevEmail = (cached && cached.contact_email) || null;
        const prevPhone = (cached && cached.contact_phone) || null;
        if (orgEl && (newLogo !== prevLogo || (b.org_name && b.org_name !== prevOrgName)
            || (b.contact_email || null) !== prevEmail || (b.contact_phone || null) !== prevPhone)) {
          orgEl.innerHTML = footerOrgHtml(newLogo, b.contact_email, b.contact_phone);
        }
        // "Chat on WhatsApp" (db/060, 10/11/2026): the organisation's own
        // number from the Organisation screen; none hides the buttons.
        setWhatsAppNumber(b.whatsapp_number || null);
      })
      .catch(() => { /* fall back silently to the static config.js name/logo */ });

    // Every page's <title> is authored as "<Page> — <placeholder tenant
    // name>" (there's no build step to template it in) — swap the tail
    // for the configured tenant name here so copying this folder for a
    // new tenant doesn't leave the previous tenant's name sitting in
    // every page's browser-tab title.
    if (document.title.indexOf(' — ') !== -1) {
      document.title = document.title.replace(/ — .+$/, ' — ' + CFG.ORG_NAME);
    }
  }

  // ---- Chat on WhatsApp (10/11/2026) ------------------------------------
  // When the organisation has a WhatsApp number on its Organisation screen,
  // every page shows a round button in the bottom right corner, and any
  // element with class "whatsapp-link" (the property page has one next to
  // Contact Us) becomes a link too. Each opens a chat with that number in the
  // guest's own WhatsApp (wa.me), with a message ready to send; the property
  // page names its property in it (setWhatsAppMessage). Nothing goes through
  // the CMS. Shown from the cached branding first, then corrected by the
  // branding fetch, like the logo.
  const WA = { number: null, message: 'Hello, I have a question.' };
  function whatsAppUrl() {
    return 'https://wa.me/' + WA.number + '?text=' + encodeURIComponent(WA.message);
  }
  function renderWhatsApp() {
    let fab = document.getElementById('wa-float');
    if (!WA.number) {
      if (fab) fab.remove();
      document.querySelectorAll('.whatsapp-link').forEach((a) => { a.style.display = 'none'; });
      return;
    }
    if (!fab) {
      fab = document.createElement('a');
      fab.id = 'wa-float';
      fab.className = 'wa-float';
      fab.target = '_blank';
      fab.rel = 'noopener noreferrer';
      fab.setAttribute('aria-label', 'Chat on WhatsApp');
      fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5h16v11H9l-5 4V5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M8 10.5h.01M12 10.5h.01M16 10.5h.01" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg><span>Chat on WhatsApp</span>';
      document.body.appendChild(fab);
    }
    fab.href = whatsAppUrl();
    document.querySelectorAll('.whatsapp-link').forEach((a) => {
      a.href = whatsAppUrl();
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = '';
    });
  }
  // Laptops and desktops (DG, 11/11/2026): a browser there cannot hand a
  // wa.me link to the WhatsApp app, so it opened WhatsApp's own web page in
  // a new tab. A website cannot tell whether the app is installed, so a
  // click there opens a small menu instead: "Open WhatsApp app" (the
  // whatsapp:// link, straight into the desktop app) or "Use WhatsApp Web".
  // Phones and tablets keep the plain wa.me link, which opens the app.
  function isDesktop() {
    try {
      if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return false;
      if (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || '')) return false; // iPad in desktop mode
      return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    } catch (e) { return false; }
  }
  function closeWhatsAppMenu() {
    const m = document.getElementById('wa-menu');
    if (m) m.remove();
    document.removeEventListener('keydown', waMenuKey);
    document.removeEventListener('mousedown', waMenuOutside, true);
  }
  function waMenuKey(e) { if (e.key === 'Escape') closeWhatsAppMenu(); }
  function waMenuOutside(e) {
    const m = document.getElementById('wa-menu');
    if (m && !m.contains(e.target) && !e.target.closest('#wa-float, .whatsapp-link')) closeWhatsAppMenu();
  }
  function openWhatsAppMenu(anchor) {
    closeWhatsAppMenu();
    const q = 'phone=' + WA.number + '&text=' + encodeURIComponent(WA.message);
    const m = document.createElement('div');
    m.id = 'wa-menu';
    m.className = 'wa-menu';
    m.setAttribute('role', 'menu');
    m.innerHTML = '<a role="menuitem" href="whatsapp://send?' + q + '">Open WhatsApp app</a>'
      + '<a role="menuitem" href="https://web.whatsapp.com/send?' + q + '" target="_blank" rel="noopener noreferrer">Use WhatsApp Web</a>';
    document.body.appendChild(m);
    m.addEventListener('click', () => setTimeout(closeWhatsAppMenu, 0));
    // Above the button, right-aligned with it; below it if there is no room.
    const r = anchor.getBoundingClientRect();
    const w = m.offsetWidth, h = m.offsetHeight;
    let top = r.top - h - 8;
    if (top < 8) top = r.bottom + 8;
    let left = Math.min(r.right - w, window.innerWidth - w - 8);
    if (left < 8) left = 8;
    m.style.top = top + 'px';
    m.style.left = left + 'px';
    m.querySelector('a').focus();
    document.addEventListener('keydown', waMenuKey);
    document.addEventListener('mousedown', waMenuOutside, true);
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('#wa-float, .whatsapp-link');
    if (!a || !WA.number || !isDesktop()) return;
    e.preventDefault();
    if (document.getElementById('wa-menu')) { closeWhatsAppMenu(); return; }
    openWhatsAppMenu(a);
  });

  function setWhatsAppNumber(number) {
    WA.number = number && /^[1-9]\d{7,14}$/.test(String(number)) ? String(number) : null;
    renderWhatsApp();
  }
  function setWhatsAppMessage(text) {
    if (text) WA.message = String(text);
    renderWhatsApp();
  }

  // Footer centre column (Release A, 14/10/2026, DG): the organisation's
  // logo (or its name when no logo is uploaded), with the contact email and
  // telephone from the Organisation screen underneath. Either line is left
  // out when blank.
  function footerOrgHtml(logoUrl, email, phone) {
    const mark = logoUrl
      ? `<img class="footer-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(CFG.ORG_NAME)}">`
      : `<div class="footer-org-name">${escapeHtml(CFG.ORG_NAME)}</div>`;
    const tel = phone ? String(phone).replace(/[^+\d]/g, '') : '';
    return mark
      + (email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : '')
      + (phone ? `<a href="tel:${escapeHtml(tel)}">${escapeHtml(phone)}</a>` : '');
  }

  // Three columns (14/10/2026): left, the copyright line with the Trustpilot
  // link under it; centre, logo and contact details (footerOrgHtml); right,
  // the full site nav listed vertically (30/08/2026 direction). Reuses NAV
  // rather than duplicating the label/href list a second time.
  function renderFooter() {
    const el = document.getElementById('site-footer');
    if (!el) return;
    const links = NAV.map((n) => `<a href="${n.href}">${n.label}</a>`).join('');
    const cached = readBrandingCache();
    // #footer-trustpilot starts empty — it's only ever populated by
    // renderHeader's branding-fetch callback, once/if the tenant has set a
    // Trustpilot URL (03/09/2026 addition). The centre column starts from
    // the cached branding (or config.js) and is corrected by that same
    // callback.
    el.innerHTML = `
      <div class="bar">
        <div class="footer-left">
          <div class="footer-copy">${escapeHtml(CFG.ORG_NAME)} &copy; ${new Date().getFullYear()}</div>
          <div class="footer-trustpilot" id="footer-trustpilot"></div>
        </div>
        <div class="footer-org" id="footer-org">${footerOrgHtml((cached && cached.logo_url) || CFG.LOGO_URL, cached && cached.contact_email, cached && cached.contact_phone)}</div>
        <nav class="footer-links">${links}</nav>
      </div>`;
    setWhatsAppNumber(cached && cached.whatsapp_number);
  }

  // ---- Formatting helpers -------------------------------------------
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }
  // Thousands-separated whole-euro amount, e.g. 5444 -> "5,444"
  // (03/09/2026 fix — every euro amount on the site was previously shown
  // with no separator at all, e.g. "€5444").
  function fmtEuros(n) {
    return Math.round(n).toLocaleString('en-GB');
  }
  function fmtPrice(price) {
    return price == null ? 'Price on request' : '€' + fmtEuros(price) + ' / night';
  }
  // Whole-stay total, not per-night — used by the availability widget's
  // "this length of stay will cost you €X" message (30/08/2026), where
  // fmtPrice's "/ night" suffix would be wrong.
  function fmtTotal(price) {
    return price == null ? null : '€' + fmtEuros(price);
  }
  // Euros with cents only when the amount has them (€900, €1,234.50) —
  // fmtEuros/fmtTotal round to whole euros, which would hide a cleaning fee
  // or discount that isn't a round number.
  function fmtMoney(n) {
    const v = Number(n);
    return '€' + v.toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  }
  function fmtLongDate(iso) {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  // The itemised cost of a stay (09/10/2026), from a public quote
  // ({ start_date, end_date, breakdown }): arrival, departure, price per
  // night, nights, accommodation, any discount, cleaning fee, other costs
  // and the bold all-in total. '' when the quote carries no breakdown.
  function costBreakdownHtml(quote) {
    const b = quote && quote.breakdown;
    if (!b) return '';
    const rows = [
      ['Arrival date', fmtLongDate(quote.start_date)],
      ['Departure date', fmtLongDate(quote.end_date)],
      ['Price per night', fmtMoney(b.price_per_night) + (b.price_varies ? ' (average)' : '')],
      ['Number of nights', String(b.nights)],
      ['Accommodation', fmtMoney(b.accommodation_subtotal)],
    ];
    if (b.discount_amount > 0) {
      const what = b.discount_pct != null && b.discount_applied ? ' (' + b.discount_pct + '% ' + b.discount_applied + ')' : '';
      rows.push(['Discount' + what, '\u2212' + fmtMoney(b.discount_amount)]);
    }
    if (b.cleaning_fee > 0) rows.push(['Cleaning fee', fmtMoney(b.cleaning_fee)]);
    if (b.other_fee > 0) rows.push([b.other_fee_label || 'Other costs', fmtMoney(b.other_fee)]);
    const line = (k, v, strong) =>
      '<tr' + (strong ? ' style="border-top:2px solid currentColor;"' : '') + '>'
      + '<td style="padding:6px 12px 6px 0;' + (strong ? 'font-weight:700;padding-top:9px;' : 'color:var(--text-muted);') + '">' + escapeHtml(k) + '</td>'
      + '<td style="padding:6px 0;text-align:right;' + (strong ? 'font-weight:700;padding-top:9px;' : '') + '">' + escapeHtml(v) + '</td></tr>';
    return '<table class="cost-breakdown" style="width:100%;max-width:420px;border-collapse:collapse;margin:10px 0;font-size:14.5px;">'
      + rows.map(([k, v]) => line(k, v, false)).join('')
      + line('Total cost', fmtMoney(b.total), true)
      + '</table>';
  }
  function fmtDateRange(start, end) {
    const opts = { day: 'numeric', month: 'short' };
    const s = new Date(start + 'T00:00:00Z').toLocaleDateString('en-GB', opts);
    const e = new Date(end + 'T00:00:00Z').toLocaleDateString('en-GB', opts);
    return s + ' – ' + e;
  }
  // Client-side counterpart to the server's addDaysIso (_lib/dates.ts) —
  // used to enforce "check-out must be after check-in" on a date <input>
  // by setting its `min` to the day after check-in (30/08/2026).
  function addDaysIso(iso, days) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  // Mirrors the server's formatAllowedDays (_lib/dates.ts) — turns a set of
  // day-of-week numbers (0=Sunday..6=Saturday) into plain English, e.g.
  // [5,6] -> "Fridays and Saturdays". Used for the static "Check Dates"
  // restriction hint (03/09/2026); the actual search-time rejection message
  // comes straight from the backend's own copy of this logic instead.
  const WEEKDAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  function formatAllowedDays(days) {
    const names = (days || [])
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .slice()
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_NAMES[d]);
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }
  // Builds the persistent hint shown under the "Check Dates" heading when a
  // property restricts which weekdays arrival/departure are allowed on —
  // '' (falsy) when the property has no such restriction, so callers can
  // just hide the note element in that case.
  function arrivalDepartureNote(allowedArrivalDays, allowedDepartureDays) {
    const bits = [];
    if (allowedArrivalDays && allowedArrivalDays.length > 0) {
      bits.push('Arrivals: ' + formatAllowedDays(allowedArrivalDays));
    }
    if (allowedDepartureDays && allowedDepartureDays.length > 0) {
      bits.push('Departures: ' + formatAllowedDays(allowedDepartureDays));
    }
    return bits.join(' · ');
  }
  function metaLine(l) {
    const bits = [];
    if (l.bedrooms != null) bits.push(l.bedrooms + ' bed');
    if (l.bathrooms != null) bits.push(l.bathrooms + ' bath');
    if (l.property_subtype) bits.push(cap(l.property_subtype));
    return bits.join(' · ');
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // ---- Resized photos (19/11/2026) -----------------------------------
  // Photos are uploaded at up to 2,400 pixels wide. Showing that file in a
  // 400-pixel card made moving between properties take 2-3 seconds (DG,
  // 19/11/2026). Supabase Storage's render/image endpoint (Pro plan, the
  // same one the print page and the property PDF use) returns the photo
  // scaled to the width asked for, so each spot asks for what it shows,
  // rounded up to a step of 200 pixels (so the CDN caches a few sizes, not
  // hundreds) and doubled on high-density screens. Supabase bills per
  // original photo per month, not per size or request.
  //   - A URL that isn't a Supabase Storage object URL is left as it is.
  //   - If a resized photo fails to load, the original is used instead
  //     (onerror on <img>, a probe image for background photos).
  const IMG_STEP = 200;
  const IMG_MAX = 2000;
  const IMG_QUALITY = 72;
  function imgWidthFor(cssWidth) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.ceil((Number(cssWidth) || 400) * dpr / IMG_STEP) * IMG_STEP;
    return Math.max(IMG_STEP, Math.min(IMG_MAX, w));
  }
  function sizedImageUrl(url, cssWidth) {
    if (!url || typeof url !== 'string') return url;
    const marker = '/storage/v1/object/public/';
    const i = url.indexOf(marker);
    if (i === -1) return url;
    const base = url.slice(0, i) + '/storage/v1/render/image/public/' + url.slice(i + marker.length);
    // resize=contain scales the whole photo (the default, cover, crops it).
    const params = 'width=' + imgWidthFor(cssWidth) + '&quality=' + IMG_QUALITY + '&resize=contain';
    return base + (base.includes('?') ? '&' : '?') + params;
  }
  // Display widths (CSS pixels) for each place a photo appears.
  const IMG_SIZES = {
    card: 440,      // property cards and search results
    thumb: 320,     // gallery thumbnails
    slide: () => window.innerWidth || 1400,               // full-width carousels and heroes
    lightbox: () => Math.min(window.innerWidth || 1400, 1600),
  };
  function imgSize(kind) { const v = IMG_SIZES[kind]; return typeof v === 'function' ? v() : v; }
  // An <img> showing a resized photo, falling back to the original.
  function sizedImgTag(url, kind, attrs) {
    const sized = sizedImageUrl(url, imgSize(kind));
    const fallback = sized !== url ? ` data-orig="${escapeHtml(url)}" onerror="if(this.dataset.orig&&this.src!==this.dataset.orig){this.src=this.dataset.orig}"` : '';
    return `<img src="${escapeHtml(sized)}"${fallback}${attrs ? ' ' + attrs : ''}>`;
  }
  // A background-image style for a resized photo; pair with watchBackgrounds().
  function sizedBgStyle(url, kind) {
    const sized = sizedImageUrl(url, imgSize(kind));
    return `background-image:url('${sized.replace(/'/g, "\\'")}')`;
  }
  function sizedBgAttrs(url, kind) {
    if (!url) return '';
    const sized = sizedImageUrl(url, imgSize(kind));
    return ` style="${sizedBgStyle(url, kind)}"` + (sized !== url ? ` data-orig-bg="${escapeHtml(url)}"` : '');
  }
  // Background photos have no onerror: probe each resized one and fall back.
  function watchBackgrounds(root) {
    (root || document).querySelectorAll('[data-orig-bg]').forEach((el) => {
      // The browser normalises the style to url("..."), whatever quotes we wrote.
      const m = /url\((['"]?)(.+?)\1\)/.exec(el.style.backgroundImage || '');
      const sized = m ? m[2].replace(/\\(['"])/g, '$1') : null;
      if (!sized) return;
      const probe = new Image();
      probe.onerror = () => { el.style.backgroundImage = `url('${el.dataset.origBg.replace(/'/g, "\\'")}')`; };
      probe.src = sized;
    });
  }

  // ---- Photo fallback -------------------------------------------------
  // A listing with no photos yet (or the API call still loading) gets a
  // plain branded placeholder rather than a broken <img> — real listings
  // will always have a cover_photo_url once photos are uploaded, but a
  // freshly-created one (or test data) may not.
  function thumbHtml(coverUrl, title) {
    if (coverUrl) return sizedImgTag(coverUrl, 'card', `alt="${escapeHtml(title || '')}" loading="lazy"`);
    return `<div class="no-photo">${escapeHtml(CFG.ORG_NAME)}</div>`;
  }

  // ---- Property summary card (grid) ------------------------------------
  function cardHtml(l) {
    return `
      <a class="p-card" href="property.html?id=${encodeURIComponent(l.id)}">
        <div class="thumb">
          ${l.is_special_offer_active ? '<span class="offer-badge">Special Offer</span>' : ''}
          ${thumbHtml(l.cover_photo_url, l.title)}
        </div>
        <div class="body">
          <div class="p-title">${escapeHtml(l.title)}</div>
          <div class="p-meta">${escapeHtml(l.region_tag || '')}${l.urn ? ' · ' + escapeHtml(l.urn) : ''}</div>
          <div class="p-meta">${escapeHtml(metaLine(l))}</div>
          <div class="p-desc">${escapeHtml(truncate(l.description, 110))}</div>
          <div class="p-price">${fmtPrice(l.price)}</div>
        </div>
      </a>`;
  }

  // ---- Search result row (cover left, description right) -----------------
  function resultRowHtml(l) {
    return `
      <a class="result-row" href="property.html?id=${encodeURIComponent(l.id)}">
        <div class="thumb">
          ${l.is_special_offer_active ? '<span class="offer-badge">Special Offer</span>' : ''}
          ${thumbHtml(l.cover_photo_url, l.title)}
        </div>
        <div class="body">
          <h3 style="margin-bottom:2px;">${escapeHtml(l.title)}</h3>
          <div class="p-meta">${escapeHtml(l.region_tag || '')}${l.urn ? ' · ' + escapeHtml(l.urn) : ''} · ${escapeHtml(metaLine(l))}</div>
          <p style="margin:8px 0;">${escapeHtml(l.description || '')}</p>
          <div class="p-price">${fmtPrice(l.price)}</div>
        </div>
      </a>`;
  }

  function truncate(s, n) {
    if (!s) return '';
    return s.length > n ? s.slice(0, n).trim() + '…' : s;
  }

  // ---- Free-text -> paragraphs (used by About Us) ------------------------
  // The CMS's About Us editor is a single plain-text field (no rich-text
  // markup) — blank lines are how a tenant admin separates paragraphs, so
  // split on those rather than rendering the whole thing as one <p>.
  function paragraphsHtml(text) {
    if (!text) return '';
    return text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join('');
  }

  // ---- Home page hero (image/video, 05/09/2026 addition) ----------------
  // Shown once, ahead of the property carousel below, the first time a
  // visitor loads the Home page — see db/033_home_hero.sql and the
  // "Home page hero" section of README.md. `home` is whatever
  // bg.api.home() resolved (or {} on failure) — the same object already
  // used for the plain text block under the carousel, so this needs no
  // second network call. `onDone` is called exactly once: immediately if
  // no hero is configured (or its content is missing — e.g. Hero Mode is
  // Image but no image has been uploaded yet), or after the image's fixed
  // delay, the video's configured duration, the video's natural end, or a
  // "View Properties" click.
  function initHomeHero(mountId, home, onDone) {
    const mount = document.getElementById(mountId);
    if (!mount) { onDone(); return; }

    const mode = home && home.home_hero_mode;
    const hasImage = mode === 'image' && home.home_hero_image_url;
    const hasVideo = mode === 'video' && home.home_hero_video_id;
    if (!hasImage && !hasVideo) { onDone(); return; }

    const IMAGE_SWAP_MS = 5000;
    let done = false;
    let swapTimer = null;

    function swap() {
      if (done) return;
      done = true;
      if (swapTimer) clearTimeout(swapTimer);
      const el = mount.querySelector('.home-hero');
      if (el) {
        el.classList.add('hero-fade-out');
        setTimeout(onDone, 620);
      } else {
        onDone();
      }
    }

    const headline = home.home_hero_headline || '';
    const subheading = home.home_hero_subheading || '';
    const ctaRow =
      '<div class="cta-row">' +
        '<a class="btn btn-cta" href="search.html">Search Properties</a>' +
        '<button type="button" class="btn btn-outline" id="home-hero-skip">View Properties</button>' +
      '</div>';
    const info =
      '<div class="info">' +
        (headline ? '<div class="title">' + escapeHtml(headline) + '</div>' : '') +
        (subheading ? '<div class="subtitle">' + escapeHtml(subheading) + '</div>' : '') +
        ctaRow +
      '</div>';

    if (hasImage) {
      mount.innerHTML = '<div class="home-hero"' + sizedBgAttrs(home.home_hero_image_url, 'slide') + '><div class="scrim"></div>' + info + '</div>';
      watchBackgrounds(mount);
      document.getElementById('home-hero-skip').addEventListener('click', swap);
      swapTimer = setTimeout(swap, IMAGE_SWAP_MS);
      return;
    }

    // Video — built via the official YouTube IFrame Player API rather
    // than a hand-assembled embed URL, specifically so `origin` is always
    // the domain actually serving the page (see db/033_home_hero.sql's
    // comment on why only the video ID is ever stored, never a full URL —
    // a stored URL's origin/tracking query params are only ever correct
    // for the one domain they were copied from).
    mount.innerHTML =
      '<div class="home-hero">' +
        '<div class="home-hero-video-wrap"><div id="home-hero-yt-mount"></div></div>' +
        '<button type="button" class="home-hero-mute-btn" id="home-hero-mute-btn" aria-label="Unmute video">🔇</button>' +
        '<div class="scrim"></div>' +
        info +
      '</div>';
    document.getElementById('home-hero-skip').addEventListener('click', swap);

    let player = null;
    let muted = true;
    document.getElementById('home-hero-mute-btn').addEventListener('click', () => {
      if (!player) return;
      muted = !muted;
      if (muted) player.mute(); else player.unMute();
      const btn = document.getElementById('home-hero-mute-btn');
      if (btn) { btn.textContent = muted ? '🔇' : '🔊'; btn.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video'); }
    });

    // If the IFrame API script never loads (blocked, offline), don't
    // strand a visitor looking at a blank panel — fall back to the
    // carousel after a reasonable wait.
    const apiLoadFallback = setTimeout(() => { if (!player) swap(); }, 8000);

    function createPlayer() {
      player = new YT.Player('home-hero-yt-mount', {
        videoId: home.home_hero_video_id,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          rel: 0,
          playsinline: 1,
          cc_load_policy: 0,
          modestbranding: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            clearTimeout(apiLoadFallback);
            e.target.mute();
            e.target.playVideo();
            if (home.home_hero_video_seconds) swapTimer = setTimeout(swap, home.home_hero_video_seconds * 1000);
          },
          onStateChange: (e) => {
            if (!home.home_hero_video_seconds && e.data === YT.PlayerState.ENDED) swap();
          },
        },
      });
    }

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof previousReady === 'function') previousReady();
        createPlayer();
      };
      if (!document.getElementById('bg-youtube-iframe-api')) {
        const tag = document.createElement('script');
        tag.id = 'bg-youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }
  }

  // ---- Per-property hero (06/09/2026 addition, revised 07/09/2026) ------
  // Sibling to initHomeHero() above, for a single property's own page
  // (property.html) rather than the tenant-wide Home page — see
  // db/034_listing_hero.sql. Deliberately NOT built by generalizing
  // initHomeHero(): that function is already shipped and tested on the
  // live Home page, and duplicating its video-construction logic here is a
  // smaller, lower-risk change than refactoring it to serve both call
  // sites. Also deliberately narrower than the Home hero: no headline/
  // subtitle/CTA-row overlay of its own (a single-property page has
  // nowhere meaningful to send a "Search Properties" button) — just the
  // hero content and a small "Skip" control.
  //
  // 08/09/2026 (DG report): Image Hero Mode no longer gets a separate
  // timed splash here at all — a fixed-5s "hero image" screen with its own
  // Skip button was redundant with, and visually duplicated, the gallery
  // carousel it handed off to a moment later (that carousel's own first
  // slide is already this same effective hero image — see property.html's
  // gallerySlides — and it already carries its own "Check Dates" CTA on
  // every slide via initHeroSlider's propertyPage option). So for Image
  // mode this now calls `onDone` immediately: the caller (property.html)
  // swaps straight to the carousel, whose first frame IS the hero image,
  // followed by the rest of the gallery in order — one continuous
  // sequence, no redundant duplicate frame or pointless Skip button.
  // Video mode is unchanged: a "Skip" control still makes sense there
  // (something is actually playing to skip), and this function remains
  // the property page's video intro phase, handing off — after its
  // configured duration, its natural end, or a "Skip" click — to that same
  // carousel afterwards.
  //
  // 07/09/2026: a "Check Dates" CTA overlays the video intro itself, not
  // just the gallery carousel it hands off to — DG feedback was that a
  // visitor watching the hero video had no way to jump to booking without
  // first waiting it out. Reuses the exact .info/.cta-row overlay markup
  // initHomeHero() already uses, just with no headline/subtitle (this page
  // has its own <h1>/description below the hero) — a single CTA row,
  // bottom-aligned via .home-hero's own align-items:flex-end.
  //
  // `listing` is whatever bg.api.listing() resolved. `onDone` is called
  // exactly once: immediately when there's no video to play (Image mode,
  // or Video mode with no video actually configured), or after the
  // video's configured duration, its natural end, or a "Skip" click.
  function initListingHero(mountId, listing, onDone) {
    const mount = document.getElementById(mountId);
    if (!mount) { onDone(); return; }

    const hasVideo = listing && listing.hero_mode === 'video' && listing.hero_video_id;
    if (!hasVideo) { onDone(); return; }

    let done = false;
    let swapTimer = null;

    function swap() {
      if (done) return;
      done = true;
      if (swapTimer) clearTimeout(swapTimer);
      const el = mount.querySelector('.home-hero');
      if (el) {
        el.classList.add('hero-fade-out');
        setTimeout(onDone, 620);
      } else {
        onDone();
      }
    }

    // No headline/subtitle here (property.html already has its own <h1>
    // and description below the hero) — just the "Check Dates" CTA,
    // reusing the same .info/.cta-row overlay initHomeHero() uses.
    const ctaInfo =
      '<div class="info"><div class="cta-row"><a class="btn btn-cta" href="#calendar">Check Dates</a></div></div>';

    mount.innerHTML =
      '<div class="home-hero">' +
        '<div class="home-hero-video-wrap"><div id="listing-hero-yt-mount"></div></div>' +
        '<button type="button" class="home-hero-mute-btn" id="listing-hero-mute-btn" aria-label="Unmute video">🔇</button>' +
        '<button type="button" class="home-hero-skip-btn" id="listing-hero-skip">Skip</button>' +
        '<div class="scrim"></div>' +
        ctaInfo +
      '</div>';
    document.getElementById('listing-hero-skip').addEventListener('click', swap);

    let player = null;
    let muted = true;
    document.getElementById('listing-hero-mute-btn').addEventListener('click', () => {
      if (!player) return;
      muted = !muted;
      if (muted) player.mute(); else player.unMute();
      const btn = document.getElementById('listing-hero-mute-btn');
      if (btn) { btn.textContent = muted ? '🔇' : '🔊'; btn.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video'); }
    });

    // Same "don't strand a visitor on a blank panel" fallback as
    // initHomeHero() — if the IFrame API script never loads, show the
    // normal cover image instead of nothing.
    const apiLoadFallback = setTimeout(() => { if (!player) swap(); }, 8000);

    function createPlayer() {
      player = new YT.Player('listing-hero-yt-mount', {
        videoId: listing.hero_video_id,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          rel: 0,
          playsinline: 1,
          cc_load_policy: 0,
          modestbranding: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            clearTimeout(apiLoadFallback);
            e.target.mute();
            e.target.playVideo();
            if (listing.hero_video_seconds) swapTimer = setTimeout(swap, listing.hero_video_seconds * 1000);
          },
          onStateChange: (e) => {
            if (!listing.hero_video_seconds && e.data === YT.PlayerState.ENDED) swap();
          },
        },
      });
    }

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof previousReady === 'function') previousReady();
        createPlayer();
      };
      if (!document.getElementById('bg-youtube-iframe-api')) {
        const tag = document.createElement('script');
        tag.id = 'bg-youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }
  }

  // ---- Hero slider --------------------------------------------------
  // Cycles a list of listings every 8s. Order comes entirely from the
  // backend now (07/09/2026, DG request) — GET /v1/public/:slug/listings
  // already returns Special Offer listings first (sorted by descending
  // price), then the rest in the tenant's own dashboard-configured
  // carousel_sort_order (see public.ts's getPublicListings and
  // db/035_carousel_sort_order.sql) — so this just preserves whatever
  // order it receives rather than reshuffling anything client-side. (Used
  // to randomize the non-offer listings with a Fisher-Yates shuffle; that
  // random order is exactly what the tenant's own deliberate
  // drag-and-drop order now replaces.) Pass `onlyOffers: true` for the
  // Special Offers page, which cycles offer properties exclusively. The
  // badge used to read
  // "Special Offer this month!", but a Special Offer can now be live OR
  // upcoming (28/08/2026: the public API stopped hiding offers until
  // their start date), so the always-true "this month" claim was dropped
  // rather than risk it reading as false for an offer months out.
  //
  // Every page uses this same slider now (29/08/2026: dropped the
  // truncated `minimal: true` image-only variant everywhere for visual
  // consistency) — except About Us, which passes `opts.plainPhotos`: a
  // flat array of the tenant's own About Us photos (not listings) with no
  // title/CTA overlay at all. About Us is "more personalised, less
  // marketing" per the 29/08/2026 direction, so it deliberately doesn't
  // get the property-card treatment the marketing pages do.
  // Time each hero picture stays on screen before the next fades in.
  // Standard for every site: 5 s (DG, 22/11/2026; was 8 s, and 4 s was
  // tried first on staging). The fade itself is 0.9 s (site.css).
  const HERO_SLIDE_MS = 5000;

  function initHeroSlider(mountId, listings, opts) {
    opts = opts || {};
    const mount = document.getElementById(mountId);
    if (!mount) return;

    if (opts.plainPhotos) {
      const photos = listings || [];
      if (photos.length === 0) {
        mount.innerHTML = '<div class="hero-empty">No photos yet.</div>';
        return;
      }
      mount.innerHTML = photos
        .map((p, i) => {
          return `<div class="hero-slide${i === 0 ? ' active' : ''}${p.url ? '' : ' hero-caption-fallback'}"${sizedBgAttrs(p.url, 'slide')}></div>`;
        })
        .join('');
      watchBackgrounds(mount);
      if (photos.length > 1) {
        let idx = 0;
        setInterval(() => {
          const slides = mount.querySelectorAll('.hero-slide');
          slides[idx].classList.remove('active');
          idx = (idx + 1) % slides.length;
          slides[idx].classList.add('active');
        }, HERO_SLIDE_MS);
      }
      return;
    }

    let ordered;
    if (opts.onlyOffers) {
      ordered = listings.filter((l) => l.is_special_offer_active);
    } else {
      // filter() preserves array order, so this is a defensive re-split
      // rather than a reorder — the backend already returns `listings`
      // with offers first (by descending price) and the rest in the
      // tenant's dashboard order, see the comment above.
      const offers = listings.filter((l) => l.is_special_offer_active);
      const rest = listings.filter((l) => !l.is_special_offer_active);
      ordered = [...offers, ...rest];
    }

    if (ordered.length === 0) {
      mount.innerHTML = '<div class="hero-empty">No properties to show yet.</div>';
      return;
    }

    // property.html passes propertyPage: true when this is a single
    // property's own page cycling its own gallery photos (07/09/2026) —
    // "Find Out More" makes no sense pointing a property's page back at
    // itself, so only "Check Dates" (linking to this same page's own
    // #calendar box, not another page's) is shown.
    function ctaRow(l) {
      if (opts.propertyPage) {
        return '<div class="cta-row"><a class="btn btn-cta" href="#calendar">Check Dates</a></div>';
      }
      return `
              <div class="cta-row">
                <a class="btn btn-cta" href="property.html?id=${encodeURIComponent(l.id)}">Find Out More</a>
                <a class="btn btn-outline" href="property.html?id=${encodeURIComponent(l.id)}#calendar">Check dates</a>
              </div>`;
    }

    mount.innerHTML = ordered
      .map((l, i) => {
        const bg = sizedBgAttrs(l.cover_photo_url, 'slide');
        const info = `
            <div class="info">
              ${l.is_special_offer_active ? '<span class="offer-flag">Special Offer</span>' : ''}
              <div class="title">${escapeHtml(l.title)}</div>
              <div class="subtitle">${escapeHtml(l.region_tag || '')}${l.urn ? ' · ' + escapeHtml(l.urn) : ''}</div>
              <div class="desc">${escapeHtml(truncate(l.description, 160))}</div>
              ${ctaRow(l)}
            </div>`;
        return `
        <div class="hero-slide${i === 0 ? ' active' : ''}${l.cover_photo_url ? '' : ' hero-caption-fallback'}"${bg}>
          <div class="scrim"></div>
          ${info}
        </div>`;
      })
      .join('');
    watchBackgrounds(mount);

    if (ordered.length > 1) {
      let idx = 0;
      setInterval(() => {
        const slides = mount.querySelectorAll('.hero-slide');
        slides[idx].classList.remove('active');
        idx = (idx + 1) % slides.length;
        slides[idx].classList.add('active');
      }, HERO_SLIDE_MS);
    }
  }

  // ---- Gallery + lightbox ------------------------------------------
  // The lightbox tracks whatever image list it was opened with
  // (lightboxUrls/lightboxIndex) so Prev/Next and the arrow keys can step
  // through it — wireGalleryLightbox() below builds that list per
  // .gallery-grid, so each gallery (mini, full, a room's own photos)
  // navigates only within itself, not across the whole page.
  let lightboxUrls = [];
  let lightboxIndex = 0;

  function ensureLightbox() {
    if (document.getElementById('bg-lightbox')) return;
    const el = document.createElement('div');
    el.id = 'bg-lightbox';
    el.className = 'lightbox';
    el.innerHTML =
      '<button class="close" aria-label="Close">&times;</button>' +
      '<button class="nav prev" aria-label="Previous image">&#8249;</button>' +
      '<img alt="">' +
      '<button class="nav next" aria-label="Next image">&#8250;</button>' +
      '<div class="lightbox-count"></div>';
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.classList.contains('close')) closeLightbox();
      else if (e.target.classList.contains('prev')) stepLightbox(-1);
      else if (e.target.classList.contains('next')) stepLightbox(1);
    });
    document.addEventListener('keydown', (e) => {
      if (!el.classList.contains('open')) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') stepLightbox(-1);
      else if (e.key === 'ArrowRight') stepLightbox(1);
    });
    document.body.appendChild(el);
  }
  function renderLightboxFrame() {
    const el = document.getElementById('bg-lightbox');
    const img = el.querySelector('img');
    const orig = lightboxUrls[lightboxIndex];
    img.onerror = () => { if (img.src !== orig) img.src = orig; };
    img.src = sizedImageUrl(orig, imgSize('lightbox'));
    const multi = lightboxUrls.length > 1;
    el.querySelectorAll('.nav').forEach((btn) => { btn.style.display = multi ? 'flex' : 'none'; });
    const countEl = el.querySelector('.lightbox-count');
    countEl.style.display = multi ? 'block' : 'none';
    countEl.textContent = multi ? (lightboxIndex + 1) + ' / ' + lightboxUrls.length : '';
  }
  function stepLightbox(delta) {
    if (lightboxUrls.length === 0) return;
    lightboxIndex = (lightboxIndex + delta + lightboxUrls.length) % lightboxUrls.length;
    renderLightboxFrame();
  }
  function openLightbox(urls, index) {
    ensureLightbox();
    lightboxUrls = urls;
    lightboxIndex = index;
    renderLightboxFrame();
    document.getElementById('bg-lightbox').classList.add('open');
    // 20/11/2026 (DG): the page behind no longer scrolls while open.
    document.documentElement.classList.add('bg-noscroll');
  }
  function closeLightbox() {
    const el = document.getElementById('bg-lightbox');
    if (el) el.classList.remove('open');
    document.documentElement.classList.remove('bg-noscroll');
  }

  // opts.showRoomNames (31/08/2026 addition) — the property page's Gallery
  // section mixes photos from every room/area into one grid, unlike a
  // per-room block (roomBlockHtml in property.html), which already has its
  // own <h3> heading and never sets this. Pass photos with a `room_name`
  // property to have it rendered as a caption above that image; a photo
  // with no room_name (not yet assigned to a room in the CMS) renders
  // without a caption, same layout otherwise.
  function galleryGridHtml(photos, opts) {
    opts = opts || {};
    if (!photos || photos.length === 0) return '<div class="section-note">No photos yet.</div>';
    const list = opts.limit ? photos.slice(0, opts.limit) : photos;
    return (
      '<div class="gallery-grid">' +
      list.map((p) => {
        const img = sizedImgTag(p.url, 'thumb', `alt="" loading="lazy" data-lightbox="${escapeHtml(p.url)}"`);
        if (!opts.showRoomNames) return img;
        const label = p.room_name ? `<div class="gallery-item-label">${escapeHtml(p.room_name)}</div>` : '';
        return `<div class="gallery-item">${label}${img}</div>`;
      }).join('') +
      '</div>'
    );
  }
  function wireGalleryLightbox(container) {
    const root = container || document;
    // Each .gallery-grid is its own navigable set (galleryGridHtml always
    // wraps its images in one) — this keeps a room's gallery from mixing
    // into the property's full gallery, etc.
    root.querySelectorAll('.gallery-grid').forEach((grid) => {
      const imgs = Array.from(grid.querySelectorAll('[data-lightbox]'));
      const urls = imgs.map((img) => img.getAttribute('data-lightbox'));
      imgs.forEach((img, i) => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => openLightbox(urls, i));
      });
    });
    // Any [data-lightbox] image outside a .gallery-grid (not produced by
    // galleryGridHtml today, but kept robust) still opens on its own.
    Array.from(root.querySelectorAll('[data-lightbox]'))
      .filter((img) => !img.closest('.gallery-grid'))
      .forEach((img) => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => openLightbox([img.getAttribute('data-lightbox')], 0));
      });
  }

  // ---- Location map (Leaflet + OpenStreetMap — no API key needed) -----
  // The API only ever returns a fuzzed point (see _lib/geo.ts) — this
  // just draws what it's given. The template asks for two things at
  // once: a wide-area map (~10km E-W) for orientation, AND a small
  // circle at `precision_meters` diameter so the property's approximate
  // area is visible without implying an exact pin. Leaflet draws both
  // without any API key or billing account, which is simpler than the
  // CMS editor's own Google Maps picker needs to be (that one needs
  // address autocomplete + a draggable pin; this one is read-only).
  function renderLocationMap(mountId, location) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    if (!location) {
      mount.innerHTML = '<div class="section-note">Location not set for this property yet.</div>';
      return;
    }
    if (!window.L) {
      mount.innerHTML = '<div class="section-note">Map failed to load.</div>';
      return;
    }
    const map = window.L.map(mountId, { zoomControl: true, scrollWheelZoom: false });
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const center = [location.latitude, location.longitude];
    const circle = window.L.circle(center, {
      radius: location.precision_meters / 2,
      color: '#081B5D',
      fillColor: '#CFD9FA',
      fillOpacity: 0.45,
      weight: 2,
    }).addTo(map);

    // Fit to a ~4km-wide view (01/09/2026: reduced from ~10km per DG
    // report), but never zoom in tighter than that even though the circle
    // itself is much smaller — the wide view is what keeps this from
    // reading as a precise pin.
    const widePad = 0.02; // ~2-2.5km in each direction at these latitudes
    map.fitBounds([
      [center[0] - widePad / 2, center[1] - widePad],
      [center[0] + widePad / 2, center[1] + widePad],
    ]);
    setTimeout(() => map.invalidateSize(), 50);
  }

  // ---- Date range picker (Release A, 14/10/2026) -------------------
  // Replaces the browser's own <input type="date"> boxes on the Property,
  // Search and Calendar pages, which looked and behaved differently in
  // every browser (Safari vs Vivaldi). Design approved by DG from
  // `Claude outputs/date-picker-preview_2026_10_14_0940.html`.
  //
  // Each page keeps its two existing inputs (now type="hidden", same ids),
  // so the code that reads `.value` for the quote/search is unchanged. The
  // picker adds two buttons styled like the old fields, and a calendar
  // that opens under them (two months) or as a sheet from the bottom of
  // the screen on a phone (one month).
  //
  // Dates are ISO strings (YYYY-MM-DD) with UTC arithmetic only, so a
  // daylight-saving change can never shift a day. "Today" is Madrid time.
  // Stays are counted in nights: the check-out day is not a night, so the
  // first unavailable night after check-in is still a valid check-out.
  //
  // Step 2b (14/10/2026): the Property page calls
  // picker.setAvailability(response) with the answer from
  // GET /public/:slug/listings/:id/unavailable. Nights in `busy` are greyed
  // out, and the property's rules (min/max stay, arrival and departure
  // days, advance notice) stop a guest choosing a stay the price check
  // would refuse. The price check still runs and has the final word. The
  // Search and Calendar pages cover many properties, so nothing is greyed
  // out there.
  //
  // Usage: const picker = bg.initDateRange(containerEl, { startInput, endInput,
  //   applyLabel, onApply });
  // The container fires a 'daterangechange' event whenever the dates change.
  //
  // Buttons (DG, 25/10/2026): Cancel and one action button, "Check price"
  // (DG, 26/10/2026: the same as the CMS) unless the page gives `applyLabel`. Cancel (also Escape,
  // or a click outside the calendar) puts back the dates that were there
  // when the calendar opened. The action button needs both dates; it closes
  // the calendar, fires 'daterangeapply' on the container and calls
  // `onApply(start, end)`, so the page runs its own check or search.
  function madridTodayIso() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function initDateRange(root, opts) {
    const DP_SHORT = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    const DP_LONG = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const DP_DM = { day: 'numeric', month: 'short' };
    const CAL_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
    const dpFmt = (iso, o) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, o));
    const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
    const ym = (iso) => iso.slice(0, 7);
    const addMonths = (s, n) => {
      let y = +s.slice(0, 4); let m = +s.slice(5, 7) - 1 + n;
      y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
      return y + '-' + String(m + 1).padStart(2, '0');
    };
    const dowMon = (iso) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7;

    const startInput = typeof opts.startInput === 'string' ? document.getElementById(opts.startInput) : opts.startInput;
    const endInput = typeof opts.endInput === 'string' ? document.getElementById(opts.endInput) : opts.endInput;
    const uid = startInput.id;
    const mq = window.matchMedia('(max-width: 640px)');

    const fields = document.createElement('div');
    fields.className = 'dp-fields';
    fields.innerHTML =
      '<div class="dp-field"><span class="dp-label" id="' + uid + '-lbl-in">Check-in</span>' +
      '<button type="button" class="dp-trigger" id="' + uid + '-btn-in" aria-labelledby="' + uid + '-lbl-in ' + uid + '-btn-in" aria-haspopup="dialog" aria-expanded="false"></button></div>' +
      '<div class="dp-field"><span class="dp-label" id="' + uid + '-lbl-out">Check-out</span>' +
      '<button type="button" class="dp-trigger" id="' + uid + '-btn-out" aria-labelledby="' + uid + '-lbl-out ' + uid + '-btn-out" aria-haspopup="dialog" aria-expanded="false"></button></div>';
    root.classList.add('dp');
    root.insertBefore(fields, root.firstChild);
    const startBtn = fields.querySelector('#' + uid + '-btn-in');
    const endBtn = fields.querySelector('#' + uid + '-btn-out');

    const st = {
      today: madridTodayIso(),
      start: startInput.value || null,
      end: endInput.value || null,
      unavailable: new Set(),
      minNights: 1,
      maxNights: null,       // property's maximum stay (2b)
      earliest: null,        // earliest check-in allowed by advance notice (2b)
      arrivalDays: null,     // allowed arrival weekdays, 0=Sunday..6=Saturday (2b)
      departureDays: null,   // allowed departure weekdays (2b)
      hover: null, hint: null, mode: 'start',
      view: null, focusIso: null, pop: null, backdrop: null,
      saved: null,           // the dates when the calendar opened (Cancel)
    };
    const applyLabel = opts.applyLabel || 'Check price';

    const isUnavail = (iso) => st.unavailable.has(iso);
    const dowSun = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
    const arrivalOk = (iso) => !st.arrivalDays || st.arrivalDays.includes(dowSun(iso));
    const departureOk = (iso) => !st.departureDays || st.departureDays.includes(dowSun(iso));
    const canCheckIn = (iso) => iso >= st.today && (!st.earliest || iso >= st.earliest) && !isUnavail(iso) && arrivalOk(iso);
    function lastCheckOut() {
      let d = st.start; const limit = addDaysIso(st.start, 365);
      while (d < limit) { if (isUnavail(d)) return d; d = addDaysIso(d, 1); }
      return limit;
    }
    function canCheckOut(iso) {
      if (!st.start || iso <= st.start) return false;
      const n = daysBetween(st.start, iso);
      if (n < st.minNights) return false;
      if (st.maxNights && n > st.maxNights) return false;
      if (!departureOk(iso)) return false;
      return iso <= lastCheckOut();
    }
    const phase = () => (st.start && (!st.end || st.mode === 'end') ? 'end' : 'start');
    const monthsShown = () => (mq.matches ? 1 : 2);

    function rangeText(s, e) {
      if (!s) return '<span class="muted">No dates chosen yet</span>';
      const n = e ? daysBetween(s, e) : 0;
      return dpFmt(s, DP_DM) + ' – ' + (e ? dpFmt(e, DP_DM) : '…') +
        (n ? ' <span class="muted">· ' + n + (n === 1 ? ' night' : ' nights') + '</span>' : '');
    }

    function syncTriggers(fire) {
      startBtn.innerHTML = (st.start ? '<span>' + dpFmt(st.start, DP_SHORT) + '</span>' : '<span class="ph">Add date</span>') + CAL_ICON;
      endBtn.innerHTML = (st.end ? '<span>' + dpFmt(st.end, DP_SHORT) + '</span>' : '<span class="ph">Add date</span>') + CAL_ICON;
      const changed = startInput.value !== (st.start || '') || endInput.value !== (st.end || '');
      startInput.value = st.start || '';
      endInput.value = st.end || '';
      if (fire && changed) root.dispatchEvent(new CustomEvent('daterangechange', { detail: { start: st.start, end: st.end } }));
    }

    function setExpanded(on) {
      [startBtn, endBtn].forEach((b) => b.setAttribute('aria-expanded', on ? 'true' : 'false'));
      startBtn.classList.toggle('is-active', on && phase() === 'start');
      endBtn.classList.toggle('is-active', on && phase() === 'end');
    }

    function open(which) {
      st.mode = which;
      const anchor = which === 'end' && st.start ? (st.end || addDaysIso(st.start, 1)) : (st.start || st.today);
      st.view = ym(anchor < st.today ? st.today : anchor);
      if (monthsShown() === 2 && which === 'end' && st.end && ym(st.end) !== ym(st.start)) st.view = ym(st.start);
      st.focusIso = anchor < st.today ? st.today : anchor;
      if (!st.pop) {
        st.saved = { start: st.start, end: st.end };
        st.backdrop = document.createElement('div');
        st.backdrop.className = 'dp-backdrop';
        st.pop = document.createElement('div');
        st.pop.className = 'dp-pop';
        st.pop.setAttribute('role', 'dialog');
        st.pop.setAttribute('aria-label', 'Choose your dates');
        root.appendChild(st.backdrop);
        root.appendChild(st.pop);
        st.backdrop.addEventListener('click', () => close(false, true));
        st.pop.addEventListener('keydown', onKey);
      }
      render();
      setExpanded(true);
      focusDay();
    }

    // `revert` (Cancel, Escape, a click outside): put back the dates the
    // calendar opened with.
    function close(returnFocus, revert) {
      if (!st.pop) return;
      if (revert && st.saved) { st.start = st.saved.start; st.end = st.saved.end; st.mode = 'start'; }
      st.saved = null;
      st.pop.remove(); st.backdrop.remove();
      st.pop = null; st.backdrop = null; st.hover = null; st.hint = null;
      setExpanded(false);
      syncTriggers(true);
      if (returnFocus) (st.end ? endBtn : startBtn).focus();
    }

    function choose(iso) {
      if (phase() === 'start') {
        if (!canCheckIn(iso)) return;
        st.start = iso; st.end = null; st.hint = null; st.mode = 'end';
      } else if (iso <= st.start) {
        if (canCheckIn(iso)) { st.start = iso; st.end = null; st.hint = null; }
      } else if (canCheckOut(iso)) {
        st.end = iso; st.hint = null; st.mode = 'start';
      } else if (daysBetween(st.start, iso) < st.minNights) {
        st.hint = 'Minimum stay is ' + st.minNights + ' nights.';
      } else if (st.maxNights && daysBetween(st.start, iso) > st.maxNights && iso <= lastCheckOut()) {
        st.hint = 'Maximum stay is ' + st.maxNights + ' nights.';
      } else if (!departureOk(iso) && iso <= lastCheckOut()) {
        st.hint = 'Departure is only possible on ' + formatAllowedDays(st.departureDays) + '.';
      } else if (canCheckIn(iso)) {
        st.start = iso; st.end = null;
        st.hint = 'Some nights in that range are not available, so your check-in moved to ' + dpFmt(iso, DP_DM) + '.';
      } else {
        st.hint = 'Some nights in that range are not available.';
      }
      st.focusIso = iso;
      syncTriggers(true);
      render();
      setExpanded(true);
      focusDay();
    }

    function render() {
      const n = monthsShown();
      const firstAllowed = ym(st.today);
      if (st.view < firstAllowed) st.view = firstAllowed;
      const ph = phase();
      const rangeEnd = (ph === 'end' && st.hover && canCheckOut(st.hover)) ? st.hover : st.end;
      let html = '<div class="dp-head"><div class="dp-step" aria-live="polite">' +
        (ph === 'start' ? 'Choose your check-in date' : 'Now choose your check-out date') + '</div>' +
        '<div class="dp-navs"><button type="button" class="dp-nav" data-nav="-1" aria-label="Previous month"' + (st.view <= firstAllowed ? ' disabled' : '') + '>&#8249;</button>' +
        '<button type="button" class="dp-nav" data-nav="1" aria-label="Next month">&#8250;</button></div></div><div class="dp-months">';
      for (let m = 0; m < n; m++) {
        const mon = addMonths(st.view, m);
        const first = mon + '-01';
        const title = dpFmt(first, { month: 'long', year: 'numeric' });
        html += '<div class="dp-month"><h3>' + title + '</h3><div class="dp-grid" role="grid" aria-label="' + title + '">';
        ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach((d) => { html += '<div class="dp-dow" aria-hidden="true">' + d + '</div>'; });
        for (let i = 0; i < dowMon(first); i++) html += '<div class="dp-cell"></div>';
        for (let d = first; ym(d) === mon; d = addDaysIso(d, 1)) {
          const cls = ['dp-day']; const cell = ['dp-cell'];
          let disabled; let label = dpFmt(d, DP_LONG);
          if (d === st.today) cls.push('is-today');
          const unav = isUnavail(d);
          if (ph === 'start') {
            disabled = !canCheckIn(d);
            // The chosen check-out may be the first taken night (the
            // check-out day is not a night of the stay), so never grey it.
            if (unav && d >= st.today && d !== st.end) { cls.push('is-unavail'); label += ', not available'; }
            else if (disabled && d >= st.today) label += ', not possible as an arrival day';
          } else {
            const okOut = canCheckOut(d);
            const okIn = d < st.start && canCheckIn(d);
            disabled = !(okOut || okIn || d === st.start);
            if (unav && okOut) { cls.push('is-checkout-only'); label += ', check-out only'; }
            else if (unav && d >= st.today) { cls.push('is-unavail'); label += ', not available'; }
          }
          if (d < st.today) disabled = true;
          if (d === st.start || d === st.end) cls.push('is-endpoint');
          if (st.start && rangeEnd) {
            if (d > st.start && d < rangeEnd) cell.push('in-range');
            if (d === st.start) cell.push('range-start');
            if (d === rangeEnd) cell.push('range-end');
          }
          html += '<div class="' + cell.join(' ') + '" role="gridcell"><button type="button" class="' + cls.join(' ') + '" data-day="' + d + '"' +
            ' tabindex="' + (d === st.focusIso ? '0' : '-1') + '" aria-label="' + label + '"' +
            ((d === st.start || d === st.end) ? ' aria-pressed="true"' : '') + (disabled ? ' aria-disabled="true"' : '') + '>' + (+d.slice(8)) + '</button></div>';
        }
        html += '</div></div>';
      }
      html += '</div>';
      if (st.hint) html += '<div class="dp-hint" role="status">' + escapeHtml(st.hint) + '</div>';
      const rulesLine = rulesText();
      if (rulesLine) html += '<div class="dp-rules">' + escapeHtml(rulesLine) + '</div>';
      if (st.unavailable.size) {
        html += '<div class="dp-legend"><span><i class="k-sel"></i>Your dates</span><span><i class="k-unav"></i>Not available</span><span><i class="k-co"></i>Check-out only</span></div>';
      }
      html += '<div class="dp-foot"><div class="dp-summary">' + rangeText(st.start, rangeEnd) + '</div><div class="dp-actions">' +
        '<button type="button" class="btn btn-secondary" data-act="cancel">Cancel</button>' +
        '<button type="button" class="btn btn-cta" data-act="apply"' + (st.start && st.end ? '' : ' disabled') + '>' + escapeHtml(applyLabel) + '</button></div></div>';
      st.pop.innerHTML = html;

      st.pop.querySelectorAll('.dp-nav').forEach((b) => {
        b.addEventListener('click', () => {
          st.view = addMonths(st.view, +b.dataset.nav);
          st.focusIso = (st.view + '-01') < st.today ? st.today : st.view + '-01';
          render();
        });
      });
      st.pop.querySelectorAll('.dp-day').forEach((b) => {
        b.addEventListener('click', () => { if (b.getAttribute('aria-disabled') !== 'true') choose(b.dataset.day); });
        b.addEventListener('mouseenter', () => {
          if (phase() === 'end' && st.hover !== b.dataset.day) { st.hover = b.dataset.day; paintRange(); }
        });
      });
      st.pop.querySelector('[data-act="cancel"]').addEventListener('click', () => close(true, true));
      st.pop.querySelector('[data-act="apply"]').addEventListener('click', apply);
    }

    function apply() {
      if (!st.start || !st.end) return;
      close(true, false);
      root.dispatchEvent(new CustomEvent('daterangeapply', { detail: { start: st.start, end: st.end } }));
      if (typeof opts.onApply === 'function') opts.onApply(st.start, st.end);
    }

    // The property's booking rules in one short line under the calendar
    // (2b), so a greyed-out day never looks unexplained.
    function rulesText() {
      const parts = [];
      if (st.minNights > 1) parts.push('Minimum stay ' + st.minNights + ' nights');
      if (st.maxNights) parts.push('maximum ' + st.maxNights + ' nights');
      if (st.arrivalDays) parts.push('arrival on ' + formatAllowedDays(st.arrivalDays));
      if (st.departureDays) parts.push('departure on ' + formatAllowedDays(st.departureDays));
      if (st.earliest && st.earliest > st.today) parts.push('earliest arrival ' + dpFmt(st.earliest, DP_DM));
      if (!parts.length) return '';
      const t = parts.join(' · ');
      return t.charAt(0).toUpperCase() + t.slice(1) + '.';
    }

    // Hover only repaints the range band, so the pointer never loses the
    // button it is over (a full re-render would).
    function paintRange() {
      const rangeEnd = st.hover && canCheckOut(st.hover) ? st.hover : null;
      const s = st.start;
      st.pop.querySelectorAll('.dp-day').forEach((b) => {
        const d = b.dataset.day; const c = b.parentNode.classList;
        c.toggle('in-range', !!rangeEnd && d > s && d < rangeEnd);
        c.toggle('range-start', !!rangeEnd && d === s);
        c.toggle('range-end', !!rangeEnd && d === rangeEnd);
      });
      const sum = st.pop.querySelector('.dp-summary');
      if (sum) sum.innerHTML = rangeText(s, rangeEnd);
    }

    function focusDay() {
      const b = st.pop && st.pop.querySelector('[data-day="' + st.focusIso + '"]');
      if (b) b.focus({ preventScroll: mq.matches });
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(true, true); return; }
      const t = e.target;
      if (!t.dataset || !t.dataset.day) return;
      const day = t.dataset.day;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      let next = null;
      if (step) next = addDaysIso(day, step);
      else if (e.key === 'PageUp') next = addDaysIso(day, -28);
      else if (e.key === 'PageDown') next = addDaysIso(day, 28);
      else if (e.key === 'Home') next = addDaysIso(day, -dowMon(day));
      else if (e.key === 'End') next = addDaysIso(day, 6 - dowMon(day));
      if (!next) return;
      e.preventDefault();
      if (next < st.today) next = st.today;
      st.focusIso = next;
      if (phase() === 'end') st.hover = next;
      const last = addMonths(st.view, monthsShown() - 1);
      if (ym(next) < st.view) st.view = ym(next);
      else if (ym(next) > last) st.view = addMonths(ym(next), -(monthsShown() - 1));
      render();
      focusDay();
    }

    startBtn.addEventListener('click', () => open('start'));
    endBtn.addEventListener('click', () => open(st.start ? 'end' : 'start'));
    document.addEventListener('mousedown', (e) => { if (st.pop && !root.contains(e.target)) close(false, true); });
    const onMq = () => { if (st.pop) render(); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else mq.addListener(onMq);
    syncTriggers(false);

    return {
      // Set both dates from code (e.g. the Property page's "Special Offer
      // Dates" link). Silently ignores an invalid pair.
      setRange(start, end) {
        if (!start || !end || end <= start) return;
        st.start = start; st.end = end; st.mode = 'start';
        syncTriggers(true);
      },
      clear() {
        st.start = null; st.end = null; st.mode = 'start';
        if (st.pop) close(false); else syncTriggers(true);
      },
      // Nights that cannot be booked, as ISO dates, plus the minimum stay.
      setUnavailable(nights, o) {
        st.unavailable = new Set(nights || []);
        st.minNights = (o && o.minNights) || 1;
        if (st.pop) render();
      },
      // Step 2b (14/10/2026): the whole answer from the unavailable-nights
      // route. `busy` ranges have an exclusive end (the first free night).
      setAvailability(data) {
        const nights = new Set();
        ((data && data.busy) || []).forEach((b) => {
          for (let d = b.start; d < b.end; d = addDaysIso(d, 1)) nights.add(d);
        });
        const r = (data && data.rules) || {};
        st.unavailable = nights;
        st.minNights = Math.max(1, r.min_stay_nights || 1);
        st.maxNights = r.max_stay_nights || null;
        st.earliest = r.earliest_check_in || null;
        st.arrivalDays = r.allowed_arrival_days && r.allowed_arrival_days.length ? r.allowed_arrival_days : null;
        st.departureDays = r.allowed_departure_days && r.allowed_departure_days.length ? r.allowed_departure_days : null;
        if (st.pop) render();
      },
      focus() { startBtn.focus(); },
    };
  }

  // ---- expose -----------------------------------------------------
  // Cancellation policy (Release E step 1, 20/10/2026). The API sends
  // listing.cancellation_policy as { lines: [...], note } — already worded,
  // with the property's own policy winning over the organisation's — or
  // null when none is saved, in which case nothing is shown.
  function cancellationPolicyHtml(policy) {
    if (!policy || !Array.isArray(policy.lines) || policy.lines.length === 0) return '';
    const items = policy.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
    const note = policy.note && String(policy.note).trim()
      ? `<p class="cancel-policy-note">${escapeHtml(String(policy.note).trim()).replace(/\n/g, '<br>')}</p>` : '';
    return `<ul class="cancel-policy-list">${items}</ul>${note}`
      + '<p class="cancel-policy-small">Charges are a percentage of the accommodation price only.</p>';
  }

  // Links to a part of the page already open (20/11/2026, DG): the Mini
  // menu's "Properties" and "About us" go to index.html#properties, but the
  // Home page is usually open as "/", which the browser treats as another
  // page and loads again (every photo with it). A link whose page is the one
  // open ("/" and "/index.html" are the same) and whose target exists now
  // just scrolls there; the address keeps the #part for Back and sharing.
  (function () {
    const samePage = (path) => path.replace(/\/index\.html$/, '/') === location.pathname.replace(/\/index\.html$/, '/');
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a[href*="#"]');
      if (!a || (a.target && a.target !== '_self')) return;
      let url;
      try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
      if (url.origin !== location.origin || !url.hash || url.search !== location.search || !samePage(url.pathname)) return;
      let target = null;
      try { target = document.getElementById(decodeURIComponent(url.hash.slice(1))); } catch (err) { return; }
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (location.hash !== url.hash) history.pushState(null, '', location.pathname + location.search + url.hash);
    });
  })();

  window.bg = {
    api,
    renderHeader,
    renderFooter,
    escapeHtml,
    orgName: () => CFG.ORG_NAME,
    fmtEuros,
    fmtPrice,
    fmtTotal,
    fmtMoney,
    fmtLongDate,
    costBreakdownHtml,
    fmtDateRange,
    addDaysIso,
    madridTodayIso,
    initDateRange,
    formatAllowedDays,
    arrivalDepartureNote,
    cancellationPolicyHtml,
    setWhatsAppMessage,
    metaLine,
    thumbHtml,
    sizedImageUrl,
    sizedImgTag,
    cardHtml,
    resultRowHtml,
    truncate,
    paragraphsHtml,
    initHeroSlider,
    initHomeHero,
    initListingHero,
    galleryGridHtml,
    wireGalleryLightbox,
    openLightbox,
    closeLightbox,
    renderLocationMap,
  };
})();
