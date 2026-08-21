# Bootcade — landing page + game catalog

Static site for Bootcade, deployed on Netlify. No build step beyond
pre-rendering (see below), no runtime dependencies — plain HTML/CSS/JS.

Split out from the [bootcade app repo](https://github.com/battousai90/fbneo-launcher)
(still under its original repo name — only the site is rebranded so far) so the
site's own deploys, history and issues don't churn every time the desktop app
changes, and vice versa.

| File / dir | Role |
|---|---|
| `index.html` | The landing page (English source of truth) |
| `catalog/`   | The game catalog — browses data generated on the homelab, fetched cross-origin at runtime (`files.gcourtot.duckdns.org`) |
| `style.css`  | Shared theme |
| `logo.svg`, `og.png`, `fbneo-logo.png` | Brand/social assets — `fbneo-logo.png` credits the underlying FinalBurn Neo project specifically, not this site's own brand |
| `i18n.js`    | Translations for every non-English page, consumed at build time only |
| `app.js`     | Small runtime (theme toggle, language menu, release fetch) |
| `build.js`   | Pre-renders one static page per language, regenerates `sitemap.xml` |

## Deploying

Netlify is configured by `netlify.toml` at the repository root: publish
directory `.`, build command `node build.js`. Connect the repo once and every
push to the default branch redeploys.

Two short links are set up as redirects: `/download` and `/github` — both
point at the app repo's GitHub Releases/issues, which keeps its original name
for now.

## Local preview

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Building the site

```bash
node build.js
```

Pre-renders one static page per language into `fr/`, `es/`, `de/`, `pt/`,
`ja/`, `zh/`, `th/` (landing page and `catalog/`), rewrites the English
`index.html`/`catalog/index.html` in place, and regenerates `sitemap.xml`.
Running it repeatedly is a no-op — it strips what it previously injected
before re-adding it.

Edit `index.html`/`catalog/index.html` (English) and `i18n.js` (other
languages), then rebuild. Netlify runs this automatically via `netlify.toml`.

## Known follow-up

The visual brand assets (`logo.svg`, `og.png`, favicon) are still the old
ones, generic enough to reuse for now but not actually designed for
"Bootcade" — worth revisiting once the app itself gets renamed too.
