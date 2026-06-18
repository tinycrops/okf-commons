# OKF Commons

A shared knowledge commons for the tabs worth keeping. Paste a URL (and *why* you kept
it open); it's fetched, compressed into [Open Knowledge Format](https://en.wikipedia.org/wiki/Open_Knowledge_Foundation),
and added to a public, retrievable commons. The reward is the close, not the open.

**Live:** https://tinycrops.github.io/okf-commons/

Two surfaces:
- `index.html` — feature-forward landing page. The objective: a place for friends to work
  together on the content that interests them.
- `commons.html` — the brain space / working surface: the founding concept, the live
  community feed, the contribute form, and the extension download.

## Architecture

Split public/private, per the `gh-pages-tailscale-funnel-deploy` pattern:

- **Frontend** (this repo, `frontend/`) — static HTML/CSS/JS, no build step, deployed to
  GitHub Pages by `.github/workflows/pages.yml`. Tolerates the backend being offline.
- **Backend** — a private FastAPI app (kept out of this repo) exposed via Tailscale Funnel
  at `/okf/`. It reuses the Tab OKF compression pipeline and writes to a community bundle
  that is separate from any personal catalog. Public submissions are SSRF-guarded and
  rate-limited.

Point the frontend at a backend by editing `frontend/config.js` (`BACKEND_URL`).

## The extension

`frontend/assets/tab-okf-extension.zip` is the Tab OKF Chrome extension — the one-key
reward loop (`Ctrl+Shift+S` banks the current tab and closes it). Load it unpacked from
`chrome://extensions`. It banks to a local capture server on your own machine; see the
README inside the zip.
