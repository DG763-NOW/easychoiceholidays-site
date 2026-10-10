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
      return apiGet('/public/' + CFG.SLUG + '/listings/' + encodeURIComponent(id)).then((r) => r.listing);
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
      }));
    } catch (e) { /* e.g. storage full/disabled — next page just misses the cache */ }
  }

  // ---- Header / footer ---------------------------------------------
  const NAV = [
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

  // Right-hand column: the full site nav, listed vertically (30/08/2026
  // direction — supersedes the 29/08/2026 "just Home and Contact" choice).
  // Reuses NAV rather than duplicating the label/href list a second time.
  function renderFooter() {
    const el = document.getElementById('site-footer');
    if (!el) return;
    const links = NAV.map((n) => `<a href="${n.href}">${n.label}</a>`).join('');
    // #footer-trustpilot starts empty — it's only ever populated by
    // renderHeader's branding-fetch callback below, once/if the tenant
    // has set a Trustpilot URL (03/09/2026 addition). No URL set means it
    // just stays empty, same "upgrade once branding is back" approach as
    // the logo/org name/accent colour.
    el.innerHTML = `
      <div class="bar">
        <div class="footer-copy">${escapeHtml(CFG.ORG_NAME)} &copy; ${new Date().getFullYear()}</div>
        <div class="footer-trustpilot" id="footer-trustpilot"></div>
        <nav class="footer-links">${links}</nav>
      </div>`;
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

  // ---- Photo fallback -------------------------------------------------
  // A listing with no photos yet (or the API call still loading) gets a
  // plain branded placeholder rather than a broken <img> — real listings
  // will always have a cover_photo_url once photos are uploaded, but a
  // freshly-created one (or test data) may not.
  function thumbHtml(coverUrl, title) {
    if (coverUrl) return `<img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(title || '')}" loading="lazy">`;
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
      const bgStyle = "background-image:url('" + home.home_hero_image_url.replace(/'/g, "\\'") + "')";
      mount.innerHTML = '<div class="home-hero" style="' + bgStyle + '"><div class="scrim"></div>' + info + '</div>';
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
          const style = p.url ? `background-image:url('${p.url.replace(/'/g, "\\'")}')` : '';
          return `<div class="hero-slide${i === 0 ? ' active' : ''}${p.url ? '' : ' hero-caption-fallback'}" style="${style}"></div>`;
        })
        .join('');
      if (photos.length > 1) {
        let idx = 0;
        setInterval(() => {
          const slides = mount.querySelectorAll('.hero-slide');
          slides[idx].classList.remove('active');
          idx = (idx + 1) % slides.length;
          slides[idx].classList.add('active');
        }, 8000);
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
        const bg = l.cover_photo_url ? `background-image:url('${l.cover_photo_url.replace(/'/g, "\\'")}')` : '';
        const info = `
            <div class="info">
              ${l.is_special_offer_active ? '<span class="offer-flag">Special Offer</span>' : ''}
              <div class="title">${escapeHtml(l.title)}</div>
              <div class="subtitle">${escapeHtml(l.region_tag || '')}${l.urn ? ' · ' + escapeHtml(l.urn) : ''}</div>
              <div class="desc">${escapeHtml(truncate(l.description, 160))}</div>
              ${ctaRow(l)}
            </div>`;
        return `
        <div class="hero-slide${i === 0 ? ' active' : ''}${l.cover_photo_url ? '' : ' hero-caption-fallback'}" style="${bg}">
          <div class="scrim"></div>
          ${info}
        </div>`;
      })
      .join('');

    if (ordered.length > 1) {
      let idx = 0;
      setInterval(() => {
        const slides = mount.querySelectorAll('.hero-slide');
        slides[idx].classList.remove('active');
        idx = (idx + 1) % slides.length;
        slides[idx].classList.add('active');
      }, 8000);
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
    el.querySelector('img').src = lightboxUrls[lightboxIndex];
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
  }
  function closeLightbox() {
    const el = document.getElementById('bg-lightbox');
    if (el) el.classList.remove('open');
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
        const img = `<img src="${escapeHtml(p.url)}" alt="" loading="lazy" data-lightbox="${escapeHtml(p.url)}">`;
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

  // ---- expose -----------------------------------------------------
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
    formatAllowedDays,
    arrivalDepartureNote,
    metaLine,
    thumbHtml,
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
