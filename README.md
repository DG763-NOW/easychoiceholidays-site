**Updated 13/10/2026 — deploys from Git now.** This folder is the private
repo `DG763-NOW/easychoiceholidays-site`, and its Netlify site
(`easychoiceholidays`) is linked to that repo: **a push to `main` deploys
the live site.** No `netlify deploy` and no `.netlify` link are needed any
more. The older notes below that mention the Netlify CLI are history. Push
only what is meant to go live; to roll back, use "Publish deploy" on an
earlier deploy in Netlify, or revert the commit and push.

# Easychoice Holidays — public website

**Updated 11/09/2026** — `assets/site.js` only, a follow-up to the
10/09/2026 branding-cache fix below. That fix was correct but Safari kept
visibly flashing the logo on every page nav anyway, even once the cache
was warm and the fetched branding hadn't actually changed — `renderHeader()`
was unconditionally rewriting the brand mark's `innerHTML` regardless of
whether anything was different, and Safari (unlike Chromium) visibly
repaints an `<img>` on a same-content `innerHTML` replace. Now the logo/
org name/accent colour are only written to the DOM when they've actually
changed since the cache. **Important:** this fix cannot take effect on the
live site until the Netlify CLI site-link is repaired — a stray deploy
from this folder recently landed on an unrelated site
(`golfgardensmiraflores.es`) because `.netlify/state.json` was missing
here; run `netlify unlink` then `netlify link` (pick the existing
`easychoiceholidays` site, never "Create & configure a new site") and
confirm with `netlify status` before the next `netlify deploy --prod`.

**Updated 10/09/2026** — `assets/site.js` and all seven shared HTML pages
refreshed again, this time for a branding-flash fix: this site's colour
never flashed (it has a real, static `ACCENT_COLOR` already), but the
"upgrade" pattern below (static fallback, then swap once the branding API
responds) used to repeat in full on every single page nav, not just first
load — this is a multi-page site, so every click was a fresh page load.
Now the last-fetched branding is cached per browser (`localStorage`, keyed
by `SLUG`) and applied immediately on each new page, before the fetch even
starts — the fetch still always runs and still always wins on a real
change, it just usually finds nothing to correct. First-ever visit on a
new browser still shows one brief default-then-real gap (logo especially,
since `LOGO_URL` is unset here — see below); that's unavoidable without
server-side rendering and unchanged by this fix. `assets/config.js` was
**not** touched, per the standing rule — this tenant's real `ACCENT_COLOR`/
`SLUG`/etc. stay exactly as already set. **Still needs a manual
`netlify deploy --prod` from this folder** — see "Deploying" below;
writing these files to disk isn't itself a deploy, and this site isn't
git-tracked at all so a `git push` elsewhere has no effect on it.

**Updated 06/09/2026** — the shared template files (`about.html`,
`calendar.html`, `contact.html`, `index.html`, `property.html`,
`search.html`, `special-offers.html`, `assets/site.js`,
`assets/site.css`) were refreshed from Blue Gecko CMS's `website/`
template to bring this trial site up to date with everything built since
the 02/09/2026 clone: hero image/video handling fixes (the redundant
Image-mode intro splash is gone, hero image now correctly takes priority
for the carousel and every thumbnail), tenant/owner references,
arrival/departure day restrictions, weekly/monthly stay discounts,
min/max stay, and assorted smaller fixes — see the main repo's
`docs/DECISIONS.md` for the judgment calls behind each. `assets/config.js`,
this README, and `netlify.toml` were deliberately left untouched — this
tenant's real SLUG/ORG_NAME/ACCENT_COLOR/CONTACT_EMAIL values below are
already correct, no need to reset them from a template. This trial site
still needs a manual `netlify deploy --prod` from this folder (or
`netlify deploy` for a preview first) — refreshing these files on disk
doesn't itself deploy anything, unlike the CMS/`bluegeckotesting`'s
git-triggered rebuilds.

**Updated 09/10/2026 (files written to disk; NOT deployed until the CMS
release is live)** — `calendar.html`, `search.html`, `property.html`,
`contact.html`, new `booking-request.html`, `assets/site.js` and
`assets/site.css` were refreshed from the staging template: stays counted
in nights (check-out day not charged), itemised cost breakdown, the Booking
Request page (phone + country code, adults/children, language, marketing
tick box), phone on the Contact form, and the date-check messages moved
under the date boxes. The about/index/special-offers pages and
`assets/config.js` were left alone (the template's Blue Gecko favicon links
were deliberately not copied). These pages need the production CMS
release of the same date (migrations 037–042, `docs/RELEASE_2026-10-09.md`
in the main repo) — deploy this folder only after that is live, with
`netlify deploy` then `netlify deploy --prod`.

Cloned from Blue Gecko CMS's `website/` template site (02/09/2026), for the
Easychoice Holidays tenant trial. Static HTML/CSS/JS, no build step, no
framework — every page reads from the CMS's public API
(`assets/config.js`'s `API_BASE` + `SLUG`), documented in the main repo's
`README.md` under "Public website API".

**Moved 04/09/2026** from `blue-gecko-cms/easychoiceholidays` to its own
`Customers/easychoiceholidays` folder, a sibling of `blue-gecko-cms` rather
than a subfolder of it. Deliberate separation (David's call): the CMS and
`bluegeckotesting` are Blue Gecko's own codebase, deployed via GitHub +
Netlify continuous deployment; customer sites like this one are static,
per-tenant deliverables with no code history worth keeping in git, deployed
by hand via the Netlify CLI instead. Keeping them physically out of the git
repo means a customer site's files can never accidentally end up in a
commit meant for the CMS. Future customer sites should live the same way,
as siblings under `Customers/`.

This deployment is pre-configured against the `easychoice` CMS tenant
(`assets/config.js`'s `SLUG` — corrected 03/09/2026 from a wrongly-guessed
`easychoice-holidays`; see that file's own comment for how the real value
was confirmed) — that's a *real* tenant, not a test
fixture, so whatever the tenant enters in the CMS (properties, photos, Home/
About/Special Offers text, logo, branding colour) shows up here directly.
There is no template branding here — `LOGO_URL` is intentionally unset, so
the header shows a plain "Easychoice Holidays" wordmark until the tenant
uploads a real logo from the CMS's "Logo & Emails" screen.

`ORG_NAME` is only ever a *static fallback* now, not the definitive name —
the header (`renderHeader()` in `assets/site.js`) renders it immediately so
the page never waits on a network round trip, then calls
`GET /v1/public/:slug/branding` and swaps in the logo the tenant uploaded
and the tenant's real organisation name (`clients.name` in the CMS),
wherever `ORG_NAME` appears — brand mark, page `<title>` tail, footer
copyright line. A branding-API hiccup just keeps showing config.js's static
`ORG_NAME`, so keeping it accurate remains worthwhile even once this
upgrade is in use. As of 03/09/2026 the tenant's chosen brand colour
(same "Brand colour" picker on the CMS's Logo & Emails screen that colours
their emails) upgrades the header/footer background the same way, via the
same branding fetch — see `assets/site.css`'s `--header-footer-bg`.

## Pages

| File | Template page |
|---|---|
| `index.html` | Home — cycling hero slider, then a headline/sub-heading/body text block (both edited in the CMS's Edit Home Page screen) |
| `search.html` | Search — Headlines/Amenities/Dates filters |
| `calendar.html` | Calendar — the Search page's Dates filter, running alone |
| `special-offers.html` | Special Offers — slider cycling live-offer properties only, then a generic intro text block explaining how offers work (edited in the CMS's Edit Special Offers Page screen) |
| `property.html?id=...` | Property page — full detail, gallery, location, availability check, tourist licence line (when set), and (when the listing has a live/upcoming Special Offer) an offer banner |
| `about.html` | About Us — hero slider cycles the tenant's own About Us photos, then intro text, both edited in the CMS's About Us editor |
| `contact.html` | Contact — sends for real via `POST /v1/public/:slug/enquiries` (Resend). Carries the property along when arrived at from a Property page, and prefills the message when arrived at from a successful availability check |

## Before this goes live

1. **`assets/config.js`** — `SLUG` and `ORG_NAME` are already set for
   Easychoice Holidays. Still to do:
   - `CONTACT_EMAIL` is currently a placeholder (David's own address, so
     trial contact-form submissions land somewhere checked) — replace it
     with the tenant's real enquiries inbox once they're onboarded.
   - Confirm `API_BASE` points at production once this is deployed there,
     not `netlify dev`.
2. **Content** — log into the CMS as the Easychoice Holidays tenant and use
   **Edit About Us**, **Edit Home Page**, **Edit Special Offers Page**, and
   **Logo & Emails** from the Organisation Dashboard, then add/edit
   properties from the dashboard's property grid. There's nothing to edit
   in this folder for any of these — the pages just render whatever the CMS
   has; empty content in the CMS means an empty (About Us) or hidden (Home
   page text block, Special Offers page text block) section here, and no
   logo uploaded means the header stays text-only.
3. Optional: a `GOOGLE_MAPS_BROWSER_KEY` isn't needed here — the Location
   box uses Leaflet + OpenStreetMap (free, no key) rather than Google Maps.
4. **Contact form email** — delivery depends on the CMS's own
   `RESEND_API_KEY` (see main repo's `README.md`), not on anything in this
   folder. If messages aren't arriving, check that first.
5. **Search-engine indexing** — nothing in this folder currently blocks
   search engines from indexing a trial site. If this shouldn't be
   discoverable yet, add a `robots.txt` (`Disallow: /`) and/or a
   `<meta name="robots" content="noindex">` tag to each page before it's
   publicly reachable, and remove it again once the site is ready to go
   live for real.
6. **Favicon** — none of these pages set one; browsers show a generic
   blank tab icon. Not a functional issue, but worth adding before this is
   customer-facing.

## Deploying

Since 13/10/2026 this is a Git-linked Netlify site (`easychoiceholidays`),
built from the private repo `DG763-NOW/easychoiceholidays-site`, branch
`main`, build command empty, publish directory `.` (see `netlify.toml`).
Same CMS backend as `bluegeckotesting`, independent site.

```
git add <files by name>
git commit -m "..."
git push            # Netlify deploys main automatically
```

Then check the Deploys page in Netlify and the live site. Writing files to
this folder is not a deploy; a push is. Claude never pushes.

Before 13/10/2026 this folder was deployed by hand with the Netlify CLI
(`netlify deploy`, then `--prod`). A missing `.netlify/state.json` once sent
one of those deploys to an unrelated site; that risk no longer applies to a
Git-linked site.

No environment variables needed on this site — it has no functions, and
the API base URL is a plain constant in `assets/config.js`, not a secret.

Point a real domain at this site's Netlify URL whenever the trial turns
into the tenant's real production site (see the DNS playbook in the main
repo's `docs/`).
