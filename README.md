# Fabrarian

A Chrome (Manifest V3) extension that reads your **fabrary** Amplify/Cognito
tokens from the site's `localStorage` and hands them to **packrat.gg**:

```
https://packrat.gg/auth?token=<accessToken>&refreshToken=<rt>
```

Both query params are optional — the extension includes whichever token it has
captured.

## How it works

Fabrary authenticates with AWS Amplify + Cognito (app client
`8b8pm28a6k25pdlgbp6c8eq4e`), which stores tokens in the page's `localStorage`:

```
CognitoIdentityServiceProvider.<clientId>.LastAuthUser         -> <sub>
CognitoIdentityServiceProvider.<clientId>.<sub>.accessToken
CognitoIdentityServiceProvider.<clientId>.<sub>.refreshToken
CognitoIdentityServiceProvider.<clientId>.<sub>.idToken
```

- **`src/content.ts`** — a content script injected on fabrary.net / fabrary.com.
  It reads those localStorage keys and mirrors the access + refresh tokens into
  `chrome.storage.local`. It re-checks on focus, tab visibility, `storage`
  events, and a light interval so token refreshes are picked up. It also installs
  the deck tab (below).
- **`src/deck-tab.ts`** — on a deck page (`fabrary.net/decks/<deckId>`) it injects
  a **Packrat** tab into the deck's `react-tabs` tab list. Clicking it opens
  `https://packrat.gg/analyze/<deckId>` in a new tab. The tab is cloned from an
  existing one so it inherits fabrary's current styling, and it's re-injected
  across React re-renders and client-side navigation.
- **`src/background.ts`** — a small service worker that keeps the toolbar badge
  (**✓**) in sync with whether a token has been captured.
- **`src/popup/`** — the toolbar popup. Shows what's been captured and has an
  **Open in packrat.gg** button that opens the `/auth` URL in a new tab. Nothing
  opens automatically.
- **`src/config.ts`** — the one place to adjust the Cognito client id, matched
  origins, and how the packrat.gg URL is shaped.

The tokens are read from your own browser's localStorage and never sent anywhere
except the packrat.gg tab you open yourself. The only permission requested is
`storage`.

## Build

```bash
npm install
npm run build      # one-shot build into dist/ + typecheck
npm run watch      # rebuild on every save (esbuild + tsc --watch)
```

The unpacked extension is the **`dist/`** folder.

### Auto-rebuild on every change

`.claude/settings.json` registers a `PostToolUse` hook
(`scripts/rebuild-hook.mjs`) that rebuilds `dist/` after any edit to `src/`,
`public/`, `scripts/`, or the build config — so the unpacked folder is always
current on every pass. A failed build is reported back so it can be fixed.

## Load it in Chrome

1. `npm install && npm run build`
2. Visit `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `dist/` folder.
4. Sign in at fabrary.net; the toolbar badge shows **✓** once a token is caught.
5. Click the icon → **Open in packrat.gg**.

After a rebuild, hit the **reload** icon on the extension card (or reload is
automatic if you keep Chrome's extension auto-reload on).

## Icons

`public/icons/*.png` are generated placeholders (`npm run icons`). Drop in real
artwork at the same paths and sizes (16/32/48/128) to replace them.
