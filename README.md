# Fabrarian

A Chrome (Manifest V3) companion extension for [fabrary.net](https://fabrary.net),
the Flesh and Blood deckbuilder. It adds three things:

1. **Token handoff** — captures your fabrary access/refresh token and opens it in
   **packrat.gg**: `https://packrat.gg/auth?token=<accessToken>&refreshToken=<rt>`.
2. **Packrat deck tab** — on a deck page, injects a **Packrat** tab that opens
   `https://packrat.gg/analyze/<deckId>`.
3. **Sideboard tab** — a talishar-style, per-matchup sideboard editor injected as a
   **Sideboard** tab, backed by fabrary's own API so changes save to your deck.

---

## Prerequisites

- **Node.js 18+** (includes `npm`)
- **Google Chrome** (or any Chromium browser that loads unpacked MV3 extensions)

## Build

```bash
git clone https://github.com/prsauer/fabrarian.git
cd fabrarian
npm install
npm run build        # bundles src/ into dist/ and runs a typecheck
```

The build output — the **unpacked extension** — is the **`dist/`** folder.
(`dist/` is gitignored, so you build it locally; it's recreated from `src/` +
`public/` on every build.)

Scripts:

| command           | what it does                                              |
| ----------------- | --------------------------------------------------------- |
| `npm run build`   | one-shot bundle into `dist/` + `tsc` typecheck            |
| `npm run watch`   | rebuild on every save (esbuild watch + `tsc --watch`)     |
| `npm run typecheck` | typecheck only, no emit                                 |
| `npm run icons`   | regenerate the placeholder toolbar icons                  |

## Install in Chrome

1. Build once: `npm install && npm run build`.
2. Open `chrome://extensions`.
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select this project's **`dist/`** folder.
5. Pin the **Fabrarian** icon if you like, then sign in at **fabrary.net**. The
   toolbar badge shows **✓** once a token is captured.

**After rebuilding**, click the **reload** ↻ icon on the Fabrarian card in
`chrome://extensions`, then reload the fabrary tab, to pick up the new build.

## Usage

- **packrat.gg token** — click the toolbar icon → **Open in packrat.gg**.
- **Packrat tab** — open any deck (`fabrary.net/decks/<id>`) and click the injected
  **Packrat** tab.
- **Sideboard tab** — on a deck you own, open the injected **Sideboard** tab. Pick a
  matchup (hero circles / archetype pills), then click cards to move copies between
  the deck and the sideboard. Equipment slots are single-select; changes save back
  to fabrary automatically. Hover a card ~0.85s for a full-size preview.

## Development

`npm run watch` keeps `dist/` current as you edit. If you use
[Claude Code](https://claude.com/claude-code), `.claude/settings.json` also
registers a `PostToolUse` hook (`scripts/rebuild-hook.mjs`) that rebuilds `dist/`
after any edit under `src/`, `public/`, `scripts/`, or the build config.

### Project layout

- `src/content.ts` — content script on fabrary; mirrors the Cognito token into
  `chrome.storage`, and installs the injected tabs.
- `src/deck-tab.ts` — the **Packrat** deck tab.
- `src/sideboard/` — the **Sideboard** feature: `model.ts` (sideboard logic),
  `panel.ts` (UI), `tab.ts` (tab injection), `styles.ts`, `hover-preview.ts`.
- `src/fab-api/` — typed client for fabrary's AppSync GraphQL API
  (`getDeck` / `updateDeckCard` / `getCard`).
- `src/background.ts` — service worker that keeps the toolbar badge in sync.
- `src/popup/` — the toolbar popup.
- `src/config.ts` — endpoints, Cognito client id, and URL/slug helpers.
- `public/` — `manifest.json`, popup HTML/CSS, icons (copied verbatim into `dist/`).
- `build.mjs` — the esbuild bundler (ES modules for the worker/popup, a classic
  IIFE for the content script).

## How it works

Fabrary authenticates with AWS Amplify + Cognito and stores tokens in the page's
`localStorage`:

```
CognitoIdentityServiceProvider.<clientId>.LastAuthUser         -> <sub>
CognitoIdentityServiceProvider.<clientId>.<sub>.accessToken
CognitoIdentityServiceProvider.<clientId>.<sub>.refreshToken
```

The content script reads those keys (same origin) and the Sideboard talks to
fabrary's GraphQL endpoint with the captured access token — exactly the endpoint,
query, and auth header fabrary's own site uses.

## Permissions

- **`storage`** — cache the captured token for the popup.
- **host access to fabrary's AppSync GraphQL endpoint** — so the Sideboard can read
  and write your deck.
- **content scripts on `fabrary.net` / `fabrary.com`** — to read the token and
  inject the tabs.

Your tokens are read from your own browser and sent only to fabrary's API and to
the packrat.gg tab you open yourself. Note that the packrat.gg handoff passes the
token in the URL query string.

## Icons

`public/icons/*.png` are generated placeholders (`npm run icons`). Drop in real
artwork at the same paths and sizes (16/32/48/128) to replace them.
