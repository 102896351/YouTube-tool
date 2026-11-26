# YouTube-tool

A static mirror of the SnapYT YouTube downloader landing page (https://www.snapyt.app/), built for GitHub Pages.

## What is included

- `index.html` — the full homepage (hero downloader, features, how-to, FAQ, legal/compliance sections).
- `terms/`, `privacy/`, `contact/` — the corresponding local pages.
- `wp-content/`, `wp-includes/` — all original CSS, JS, fonts and images, downloaded locally so the page renders offline.
- `app.js` — replacement front-end logic (theme switch, paste, clear, URL validation, result rendering).

Removed from the original: Google Analytics, ad-network loaders, ShareThis, domain-verification meta tags, and the WordPress `admin-ajax.php` script that needed a server-side nonce.

## Enable real downloads

This repository is static; GitHub Pages cannot run a media conversion backend. The Download button validates the URL and then calls your own API if configured.

Add this before `app.js` in `index.html` (or create `site.config.js` and include it first):

```html
<script>window.YOUTUBE_TOOL_API = "https://your-backend.example.com/api/download";</script>
```

The endpoint should accept `POST` with JSON `{ "url": "https://www.youtube.com/watch?v=..." }` and return:

```json
{
  "title": "Video title",
  "formats": [
    { "label": "MP4 720p", "url": "https://..." },
    { "label": "MP3", "url": "https://..." }
  ]
}
```

Without an API configured, the page is a faithful UI clone and shows a notice on submit.

## Deploy

The site is already GitHub-Pages-ready (no build step). Push to `main`, then in the repository settings choose **Pages → Deploy from a branch → main / (root)**.

Local preview:

```bash
cd site
python -m http.server 8080
# open http://localhost:8080
```

## Legal note

The copied page content states its own usage rules: only download media you own or have explicit permission to save; do not bypass DRM or restrictions; respect YouTube's Terms and creators' rights. Keep these notices if you deploy this clone publicly.
