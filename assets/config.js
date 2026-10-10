// Blue Gecko CMS — public website config.
//
// One site deployment = one tenant. To stand up a second tenant's site,
// copy this whole folder into a new Netlify site and change only the
// values below — everything else in this folder is tenant-agnostic (it
// talks to the CMS entirely through GET /v1/public/:slug/... using SLUG,
// never a hardcoded id).
window.BG_SITE = {
  // Base URL of the Blue Gecko CMS API this site reads from. Same CMS
  // backend as every other tenant site — only SLUG below picks which
  // tenant's data this deployment shows.
  API_BASE: 'https://bluegeckocms.netlify.app/v1',
  // This tenant's clients.slug — scopes every public API call. First set
  // to a guessed 'easychoice-holidays' (the auto-slugger's hyphenated
  // guess from the display name), which turned out wrong — this tenant
  // predates that guess and was actually created with the plain slug
  // 'easychoice' (matching db/seed_easychoice.sql). Confirmed against the
  // real value via GET /v1/super-admin/tenants (03/09/2026) after the
  // guessed slug 404'd the property-clone endpoint as "Unknown target
  // tenant slug". Getting this wrong 404s the whole site as "Unknown
  // site" — if it ever needs to change again, confirm the real value the
  // same way (or the Super Admin tenant list in the dashboard UI) rather
  // than guessing from the display name.
  SLUG: 'easychoice',
  // Display name for the header/footer/tab titles. Renders immediately
  // with this value so nothing waits on a network round trip, then
  // renderHeader() in site.js upgrades it to the CMS's own `clients.name`
  // (via GET /public/:slug/branding, same call as the logo) once that's
  // back. Keep this set to something reasonable anyway, for the moment
  // before that fetch resolves and as a fallback if it ever fails.
  ORG_NAME: 'Easychoice Holidays',
  // No LOGO_URL set — unlike the blue-gecko-testing template site (which
  // deliberately shows the Blue Gecko mark itself), this is a real
  // tenant's site: it should show a text-only "Easychoice Holidays"
  // header until the tenant uploads their own logo from the CMS's
  // "Logo & Emails" screen, at which point renderHeader() picks it up
  // automatically. Do not re-add the Blue Gecko mark here.
  //
  // Optional — same "static fallback, then upgrade" idea as LOGO_URL and
  // ORG_NAME above, but applied earlier (03/09/2026): every page's <head>
  // reads this and sets it on <html> before the header/footer paint, so
  // the branding API's own accent_color (which can take a moment to
  // arrive) doesn't cause a visible flash from the CSS default
  // (site.css's --petrol, blue) to this tenant's real colour on every
  // page load. Set to this tenant's actual brand colour, as read from
  // GET /v1/public/easychoice/branding (03/09/2026) — matches whatever
  // is currently saved on the CMS's Organisation screen's Brand colour
  // picker. Keep this in sync if that ever changes; a mismatch just
  // means a shorter corrective flash rather than none.
  ACCENT_COLOR: 'rgb(194, 76, 67)',
  // PLACEHOLDER — replace with the real inbox this tenant wants enquiries
  // sent to once they're onboarded. Set to David's own address for now so
  // test contact-form submissions during the trial land somewhere that
  // gets checked.
  CONTACT_EMAIL: 'david.gillies@i-digital.tv',
};
