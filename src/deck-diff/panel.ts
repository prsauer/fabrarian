// Compact "diff vs main deck" panel pinned to the right margin of a fabrary deck
// page (exactly /decks/<id>). Shows only when the deck's hero has a main deck
// configured and this deck isn't it. Refreshes on navigation, on window focus (you may have edited
// the list on another tab), when the main-deck table changes, and on demand.
import { deckPageIdFromPath, cardImageUrl } from '../config.js';
import { currentAccessToken, getDeck, FabApiError } from '../fab-api/client.js';
import { jwtExpiry } from '../jwt.js';
import type { Deck } from '../fab-api/types.js';
import { deckUrl, heroKeyOf, onMainDecksChanged, readMainDecks, type MainDeck } from '../main-decks.js';
import { attachHoverPreview } from '../sideboard/hover-preview.js';
import { ensureStyles } from '../sideboard/styles.js';
import { diffDecks, type DeckDiff, type DiffLine } from './model.js';

const PANEL_ID = 'fabrarian-deck-diff';
const COLLAPSED_KEY = 'fabrarian:diff-collapsed';
const STYLE_ID = 'fabrarian-deck-diff-styles';

const CSS = `
#${PANEL_ID} {
  position: fixed; right: 10px; top: 96px; z-index: 2147482000; width: 210px;
  max-height: calc(100vh - 116px); display: flex; flex-direction: column;
  color: #e8e8ea; font: 12px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
  background: #17181cf2; border: 1px solid #2c2e36; border-radius: 10px;
  box-shadow: 0 8px 28px #0009; backdrop-filter: blur(6px);
}
#${PANEL_ID} * { box-sizing: border-box; }
#${PANEL_ID}.is-collapsed { width: auto; }
#${PANEL_ID}.is-collapsed .fab-dd-body, #${PANEL_ID}.is-collapsed .fab-dd-main { display: none; }
.fab-dd-head { display: flex; align-items: center; gap: 6px; padding: 7px 8px 6px; border-bottom: 1px solid #26272e; }
#${PANEL_ID}.is-collapsed .fab-dd-head { border-bottom: 0; }
.fab-dd-title { font-weight: 700; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: #9a9ca6; white-space: nowrap; }
.fab-dd-sum { margin-left: auto; font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
.fab-dd-sum .is-add { color: #3fbf6f; } .fab-dd-sum .is-rem { color: #e0483a; }
.fab-dd-btn { flex: 0 0 auto; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 5px;
  background: transparent; color: #9a9ca6; cursor: pointer; font-size: 12px; line-height: 20px; }
.fab-dd-btn:hover { background: #2d303a; color: #fff; }
.fab-dd-btn.is-busy { animation: fab-dd-spin 1s linear infinite; }
@keyframes fab-dd-spin { to { transform: rotate(360deg); } }
.fab-dd-main { padding: 5px 8px; font-size: 11px; color: #9a9ca6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid #26272e; }
.fab-dd-main a { color: #c9cad1; text-decoration: none; }
.fab-dd-main a:hover { color: #fff; text-decoration: underline; }
.fab-dd-body { overflow-y: auto; padding: 4px 0 6px; }
.fab-dd-group + .fab-dd-group { margin-top: 4px; border-top: 1px solid #26272e; padding-top: 4px; }
.fab-dd-line { display: flex; align-items: center; gap: 5px; padding: 1px 8px; white-space: nowrap; cursor: default; }
.fab-dd-line:hover { background: #22242b; }
.fab-dd-n { flex: 0 0 24px; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
.fab-dd-line.is-add .fab-dd-n { color: #3fbf6f; } .fab-dd-line.is-rem .fab-dd-n { color: #e0483a; }
.fab-dd-pip { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; background: #55575f; border: 1px solid #0008; }
.fab-dd-pip.p1 { background: #d2302c; } .fab-dd-pip.p2 { background: #e6b800; } .fab-dd-pip.p3 { background: #2f6fd6; }
.fab-dd-name { overflow: hidden; text-overflow: ellipsis; }
.fab-dd-msg { padding: 8px; color: #9a9ca6; }
.fab-dd-msg.is-error { color: #e0776a; }
`;

function ensureDiffStyles(): void {
  ensureStyles(); // the hover preview's styles live with the sideboard's
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<Record<string, string>> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

class DiffPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly sum: HTMLElement;
  private readonly mainEl: HTMLElement;
  private readonly refreshBtn: HTMLButtonElement;
  private readonly collapseBtn: HTMLButtonElement;

  constructor(onRefresh: () => void) {
    ensureDiffStyles();
    this.sum = h('span', { class: 'fab-dd-sum' });
    this.refreshBtn = h('button', { class: 'fab-dd-btn', title: 'Refresh', type: 'button' }, ['↻']);
    this.refreshBtn.addEventListener('click', onRefresh);
    this.collapseBtn = h('button', { class: 'fab-dd-btn', type: 'button' });
    this.collapseBtn.addEventListener('click', () => this.setCollapsed(!this.root.classList.contains('is-collapsed')));
    this.mainEl = h('div', { class: 'fab-dd-main' });
    this.body = h('div', { class: 'fab-dd-body' });
    this.root = h('aside', { id: PANEL_ID, 'aria-label': 'Differences from main deck' }, [
      h('div', { class: 'fab-dd-head' }, [
        h('span', { class: 'fab-dd-title' }, ['vs main']),
        this.sum,
        this.refreshBtn,
        this.collapseBtn,
      ]),
      this.mainEl,
      this.body,
    ]);
    let collapsed = false;
    try {
      collapsed = localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      /* storage unavailable (private mode etc.) */
    }
    this.setCollapsed(collapsed);
    document.body.appendChild(this.root);
  }

  private setCollapsed(collapsed: boolean): void {
    this.root.classList.toggle('is-collapsed', collapsed);
    this.collapseBtn.textContent = collapsed ? '‹' : '›';
    this.collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  setBusy(busy: boolean): void {
    this.refreshBtn.classList.toggle('is-busy', busy);
    this.refreshBtn.disabled = busy;
  }

  setMain(main: MainDeck): void {
    const link = h('a', { href: deckUrl(main.deckId), title: `Main deck: ${main.deckName}` }, [main.deckName]);
    this.mainEl.replaceChildren(link);
  }

  showMessage(text: string, isError = false): void {
    this.sum.replaceChildren();
    this.body.replaceChildren(h('div', { class: 'fab-dd-msg' + (isError ? ' is-error' : '') }, [text]));
  }

  showDiff(diff: DeckDiff): void {
    this.sum.replaceChildren(
      h('span', { class: 'is-add' }, [`+${diff.addedCopies}`]),
      ' ',
      h('span', { class: 'is-rem' }, [`−${diff.removedCopies}`]),
    );
    if (!diff.added.length && !diff.removed.length) {
      this.body.replaceChildren(h('div', { class: 'fab-dd-msg' }, ['Same cards as the main deck.']));
      return;
    }
    const group = (lines: DiffLine[], cls: string): HTMLElement =>
      h(
        'div',
        { class: 'fab-dd-group' },
        lines.map((line) => {
          const n = line.delta > 0 ? `+${line.delta}` : `−${-line.delta}`;
          const el = h('div', { class: `fab-dd-line ${cls}`, title: line.name }, [
            h('span', { class: 'fab-dd-n' }, [n]),
            h('span', { class: `fab-dd-pip p${line.pitch ?? 0}` }),
            h('span', { class: 'fab-dd-name' }, [line.name]),
          ]);
          if (line.image) attachHoverPreview(el, cardImageUrl(line.image));
          return el;
        }),
      );
    const groups: HTMLElement[] = [];
    if (diff.added.length) groups.push(group(diff.added, 'is-add'));
    if (diff.removed.length) groups.push(group(diff.removed, 'is-rem'));
    this.body.replaceChildren(...groups);
  }

  remove(): void {
    this.root.remove();
  }
}

let panel: DiffPanel | null = null;
let seq = 0;

/**
 * Retry schedule for a load that fails right after page load. Fabrary refreshes
 * an expired Cognito token a moment after the app boots, so the first request
 * can go out with a stale token (or none) and be rejected; a few spaced retries
 * pick up the fresh one.
 */
const RETRY_DELAYS_MS = [1500, 3000, 6000, 12000, 24000];
const LOG = '[fabrarian] deck-diff:';
let retryTimer: number | null = null;
let retryIndex = 0;

function cancelRetry(): void {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry(reason: string): void {
  const delay = RETRY_DELAYS_MS[retryIndex];
  if (delay === undefined) {
    console.warn(LOG, 'giving up after', RETRY_DELAYS_MS.length, 'retries:', reason);
    return;
  }
  retryIndex += 1;
  console.info(LOG, `${reason} — retry ${retryIndex}/${RETRY_DELAYS_MS.length} in ${delay}ms`);
  cancelRetry();
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void update(true);
  }, delay);
}

/** True when the page's current access token is missing or already past its `exp`. */
function tokenLooksStale(): boolean {
  const token = currentAccessToken();
  if (!token) return true;
  const exp = jwtExpiry(token);
  return exp !== null && exp <= Date.now() + 5_000;
}

/** Whether a failed load is worth retrying (auth/network hiccups, not a bad deck). */
function isTransient(err: unknown): boolean {
  return err instanceof FabApiError && err.kind !== 'graphql';
}

function errorText(err: unknown): string {
  if (err instanceof FabApiError && err.kind === 'no-token') return 'Sign in to fabrary to compare decks.';
  if (err instanceof FabApiError && err.kind === 'unauthorized') return 'Session rejected — reload the page.';
  return `Could not load: ${err instanceof Error ? err.message : String(err)}`;
}

function dropPanel(): void {
  panel?.remove();
  panel = null;
}

/**
 * Fetch this page's deck and its hero's main deck, and (re)render the diff.
 * `isRetry` continues the current back-off sequence; a fresh call restarts it.
 */
async function update(isRetry = false): Promise<void> {
  // Bump the sequence first so any load still in flight from the previous page
  // is abandoned instead of re-creating the panel after we've left.
  const mine = ++seq;
  const stale = (): boolean => mine !== seq;
  const deckId = deckPageIdFromPath(location.pathname);
  if (!deckId) {
    cancelRetry();
    dropPanel();
    return;
  }
  if (!isRetry) {
    cancelRetry();
    retryIndex = 0;
  }

  const mains = await readMainDecks();
  if (stale()) return;
  const mainList = Object.values(mains);
  // Nothing configured, or this deck *is* a main deck: nothing to compare.
  if (!mainList.length) {
    console.info(LOG, 'no main decks configured');
    dropPanel();
    return;
  }
  if (mainList.some((m) => m.deckId === deckId)) {
    console.info(LOG, `deck ${deckId} is itself a main deck`);
    dropPanel();
    return;
  }

  // Don't burn a request on a token fabrary is about to replace; just wait for it.
  if (tokenLooksStale()) {
    const token = currentAccessToken();
    const exp = token ? jwtExpiry(token) : null;
    scheduleRetry(
      token
        ? `access token expired at ${exp ? new Date(exp).toISOString() : '?'}`
        : 'no access token in localStorage',
    );
    return;
  }

  panel?.setBusy(true);
  let current: Deck;
  try {
    current = await getDeck(deckId);
  } catch (err) {
    if (stale()) return;
    panel?.setBusy(false);
    console.error(LOG, `loading deck ${deckId} failed`, err);
    if (isTransient(err)) {
      // Quietly try again shortly; only show the error once retries are spent.
      if (retryIndex < RETRY_DELAYS_MS.length) {
        scheduleRetry(`deck load failed (${err instanceof FabApiError ? err.kind : 'error'})`);
        return;
      }
    }
    // Only surface errors if a panel is already up; otherwise stay out of the way.
    panel?.showMessage(errorText(err), true);
    return;
  }
  if (stale()) return;

  const hero = heroKeyOf(current);
  const main = hero ? mains[hero] : undefined;
  if (!main || main.deckId === deckId) {
    console.info(LOG, `no main deck for hero ${hero ?? '(none)'}; configured:`, Object.keys(mains));
    dropPanel();
    return;
  }
  console.info(LOG, `deck ${deckId} (hero ${hero}) vs main ${main.deckId}`);

  if (stale() || deckPageIdFromPath(location.pathname) !== deckId) return;
  if (!panel) panel = new DiffPanel(() => void update());
  panel.setMain(main);
  panel.setBusy(true);
  try {
    const mainDeck = await getDeck(main.deckId);
    if (stale()) return;
    const diff = diffDecks(mainDeck, current);
    console.info(LOG, `diff ready: +${diff.addedCopies} / -${diff.removedCopies}`);
    panel.showDiff(diff);
  } catch (err) {
    if (stale()) return;
    console.error(LOG, `loading main deck ${main.deckId} failed`, err);
    if (isTransient(err) && retryIndex < RETRY_DELAYS_MS.length) {
      panel.showMessage('Loading main deck…');
      scheduleRetry(`main deck load failed (${err instanceof FabApiError ? err.kind : 'error'})`);
      return;
    }
    panel.showMessage(errorText(err), true);
  } finally {
    if (!stale()) panel?.setBusy(false);
  }
}

export function installDeckDiff(): void {
  let timer: number | null = null;
  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      void update();
    }, 200);
  };

  schedule();
  // Fabrary is a SPA. Its router calls pushState in the page's main world, which
  // a content script can't intercept (the history patch in the tab modules only
  // affects our isolated world), so detect navigation by watching the URL from a
  // DOM mutation observer — every route change re-renders something.
  let lastHref = location.href;
  const checkLocation = (): void => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    console.info(LOG, 'navigated to', location.pathname + location.search);
    schedule();
  };
  new MutationObserver(checkLocation).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('fabrarian:locationchange', checkLocation);
  window.addEventListener('popstate', checkLocation);
  // Coming back to the tab: the list may have been edited elsewhere.
  window.addEventListener('focus', () => {
    if (deckPageIdFromPath(location.pathname)) schedule();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && deckPageIdFromPath(location.pathname)) schedule();
  });
  onMainDecksChanged(schedule);
}
