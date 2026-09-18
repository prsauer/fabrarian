# Fabrarian

A Chrome (Manifest V3) companion extension for [fabrary.net](https://fabrary.net),
the Flesh and Blood deckbuilder. It adds two deckbuilding tools to fabrary's deck
pages, working through fabrary's own API so everything saves to your real decks:

1. **Sideboard tab** — a talishar-style, per-matchup sideboard editor. Pick a
   matchup, click cards to move copies between deck and sideboard, and watch a
   live stats bar (pitch colours, card types, block, arcane barrier, hero-specific
   counts) as you go.
2. **Main decks** — nominate one reference deck per hero. Every other deck for
   that hero then shows a compact `+N` / `−N` card diff against it in the page's
   right margin, so brews and tweaks are always readable against your baseline.

There is also an optional, off-by-default **packrat.gg** integration (a deck-page
tab that opens the deck in packrat.gg, and an opt-in session-token handoff); see
[packrat.gg](#packratgg-optional) below.

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
5. Sign in at **fabrary.net** and open a deck — the **Sideboard** tab is there.
   The toolbar badge shows **✓** once the extension has picked up your fabrary
   session (which the Sideboard and diff panel use to talk to fabrary's API).

**After rebuilding**, click the **reload** ↻ icon on the Fabrarian card in
`chrome://extensions`, then reload the fabrary tab, to pick up the new build.

## Usage

### Sideboard tab

On a deck you own (`fabrary.net/decks/<id>`), open the injected **Sideboard** tab.

- **Matchups** — the bar lists the deck's base configuration plus every matchup.
  Hero matchups show the hero's portrait (all of them, for multi-hero matchups),
  a badge with that matchup's in-deck card count, and any part of the matchup name
  beyond the hero's own name (e.g. *"(fatigue build)"*). Archetype matchups are
  text pills.
- **Cards** — one tile per registered copy. Click a tile to move that copy between
  the deck and the sideboard for the selected matchup. Equipment slots are
  single-select. Hover a tile ~0.85s for a full-size preview.
- **Stats** — deck / sideboard counts, red / yellow / blue split, attacks (with the
  6+ power subset), non-attacks, attack and defense reactions, total and average
  block, arcane barrier from the equipped gear, and hero-specific counts (e.g.
  Fang: Draconic attack reactions + instants).
- Changes save back to fabrary as you click; the deck is re-fetched every time you
  enter the tab, so it never shows a stale list.

### Main decks

Toolbar icon → **Settings & main decks…** (the extension's Options page). Paste a
fabrary deck link and submit; the hero is read from the deck itself, and each
hero keeps exactly one main deck (adding another replaces it).

Open any other deck for that hero and a **vs main** panel appears on the right of
the page: one line per differing card, `+N` / `−N` by total copies (deck +
sideboard combined — moving a card between them is not a difference), grouped
into additions then removals, with hover previews and a link to the main deck.
It refreshes on navigation, on returning to the tab, and via ↻, and can be
collapsed to a slim header. Nothing is shown on the main deck itself, on heroes
without a main deck, or on non-deck pages.

### packrat.gg (optional)

- **Packrat tab** — on a deck page, an injected **Packrat** tab opens
  `packrat.gg/analyze/<deckId>` in a new tab. No token is involved.
- **Session-token handoff** — **off by default.** Enable *Allow handing my
  fabrary session token to packrat.gg* on the Options page and the popup gains an
  **Open in packrat.gg** button that opens `packrat.gg/auth` with your access and
  refresh tokens in the URL. The choice is saved in Chrome sync storage, so it
  persists across reloads and sessions.

## Development

`npm run watch` keeps `dist/` current as you edit. If you use
[Claude Code](https://claude.com/claude-code), `.claude/settings.json` also
registers a `PostToolUse` hook (`scripts/rebuild-hook.mjs`) that rebuilds `dist/`
after any edit under `src/`, `public/`, `scripts/`, or the build config.

### Project layout

- `src/sideboard/` — the **Sideboard** feature: `model.ts` (sideboarding logic,
  deck stats, matchup labels), `panel.ts` (UI), `tab.ts` (tab injection),
  `styles.ts`, `hover-preview.ts`.
- `src/deck-diff/` — the **vs main** margin panel: `model.ts` (list diff), `panel.ts` (UI).
- `src/main-decks.ts` — the per-hero main-deck table in `chrome.storage.sync`.
- `src/options/` — the Options page: settings and the main-deck table.
- `src/settings.ts` — persisted user settings (`packratHandoff`, default off).
- `src/fab-api/` — typed client for fabrary's AppSync GraphQL API
  (`getDeck` / `updateDeckCard` / `getCard`).
- `src/content.ts` — content script on fabrary; installs the Sideboard tab, the
  diff panel and the Packrat tab, and mirrors the Cognito session into
  `chrome.storage` for the extension pages.
- `src/deck-tab.ts` — the **Packrat** deck tab.
- `src/background.ts` — service worker that keeps the toolbar badge in sync.
- `src/popup/` — the toolbar popup.
- `src/config.ts` — endpoints, Cognito client id, and URL helpers.
- `public/` — `manifest.json`, popup and options HTML/CSS, icons (copied verbatim into `dist/`).
- `build.mjs` — the esbuild bundler (ES modules for the worker/popup, a classic
  IIFE for the content script).

## How it works

The Sideboard, the diff panel and the Options page all talk to fabrary's own
GraphQL API, with the same queries and auth header fabrary's site uses. Fabrary
authenticates with AWS Amplify + Cognito and stores tokens in the page's
`localStorage`:

```
CognitoIdentityServiceProvider.<clientId>.LastAuthUser         -> <sub>
CognitoIdentityServiceProvider.<clientId>.<sub>.accessToken
CognitoIdentityServiceProvider.<clientId>.<sub>.refreshToken
```

The content script reads those keys (same origin) to make its API calls, and
mirrors them into `chrome.storage.local` so the Options page can resolve deck
links too. The optional packrat.gg handoff uses the same mirrored token.

## Permissions

- **host access to fabrary's AppSync GraphQL endpoint** — so the Sideboard, the
  diff panel and the Options page can read (and the Sideboard write) your decks.
- **content scripts on `fabrary.net` / `fabrary.com`** — to inject the Sideboard
  tab and diff panel, and read the session.
- **`storage`** — the main-deck table and settings (synced with your Chrome
  profile), plus the mirrored session for the extension pages.

Your session is read from your own browser and sent only to fabrary's API — and,
only if you turn the handoff on, to the packrat.gg tab you open yourself (where it
is passed in the URL query string).

## Icons

`public/icons/*.png` are generated placeholders (`npm run icons`). Drop in real
artwork at the same paths and sizes (16/32/48/128) to replace them.
