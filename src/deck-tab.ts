// Injects a "Packrat" tab into a fabrary deck page's react-tabs tab list. Clicking
// it opens packrat.gg/analyze/<deckId> in a new tab. Fabrary is a React SPA, so we
// clone an existing tab (to inherit the current emotion-hashed styling), and keep
// the tab present across re-renders and client-side navigation.
import { deckIdFromPath, packratAnalyzeUrl } from './config.js';

const MARK = 'data-fabrarian-tab';
const LABEL = 'Packrat';

// A box-archive glyph, matched to Font Awesome's 512x512 viewBox so it lines up
// with the sibling icons we clone from.
const ICON_VIEWBOX = '0 0 512 512';
const ICON_PATH =
  'M40 96C40 78.3 54.3 64 72 64l368 0c17.7 0 32 14.3 32 32l0 40c0 13.3-10.7 24-24 24L64 160c-13.3 0-24-10.7-24-24l0-40zM64 200l384 0 0 216c0 17.7-14.3 32-32 32L96 448c-17.7 0-32-14.3-32-32l0-216zm144 48c-8.8 0-16 7.2-16 16s7.2 16 16 16l96 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-96 0z';

function findTabList(): HTMLUListElement | null {
  return document.querySelector<HTMLUListElement>('ul.react-tabs__tab-list');
}

function buildTab(list: HTMLUListElement, deckId: string): HTMLLIElement | null {
  const template =
    list.querySelector<HTMLLIElement>('li.react-tabs__tab:not(.react-tabs__tab--selected)') ??
    list.querySelector<HTMLLIElement>('li.react-tabs__tab');
  if (!template) return null;

  const li = template.cloneNode(true) as HTMLLIElement;
  // Detach from react-tabs' own bookkeeping so it treats this as a foreign node.
  li.classList.remove('react-tabs__tab--selected');
  li.removeAttribute('id');
  li.removeAttribute('aria-controls');
  li.removeAttribute('data-rttab');
  li.setAttribute('role', 'tab');
  li.setAttribute('aria-selected', 'false');
  li.setAttribute('tabindex', '0');
  li.setAttribute(MARK, deckId);
  li.title = 'Open this deck in packrat.gg';

  const svg = li.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', ICON_VIEWBOX);
    svg.setAttribute('data-icon', 'box-archive');
    svg.querySelector('path')?.setAttribute('d', ICON_PATH);
  }

  const span = li.querySelector('span');
  if (span) {
    for (const node of Array.from(span.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) node.remove();
    }
    span.appendChild(document.createTextNode(` ${LABEL}`));
  }

  const open = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    window.open(packratAnalyzeUrl(deckId), '_blank', 'noopener');
  };
  li.addEventListener('click', open);
  li.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') open(event);
  });

  return li;
}

/** Add / refresh / remove the Packrat tab to match the current URL and DOM. */
function ensureDeckTab(): void {
  const deckId = deckIdFromPath(location.pathname);
  const existing = document.querySelector<HTMLElement>(`[${MARK}]`);

  if (!deckId) {
    existing?.remove();
    return;
  }

  const list = findTabList();
  if (!list) return; // list not mounted yet — the observer will retry

  if (existing) {
    if (existing.getAttribute(MARK) === deckId && existing.parentElement === list) return;
    existing.remove(); // deck changed, or the node was detached from the list
  }

  const li = buildTab(list, deckId);
  if (li) list.appendChild(li);
}

export function installDeckTab(): void {
  ensureDeckTab();

  // React to fabrary's client-side navigation.
  const patch = (key: 'pushState' | 'replaceState'): void => {
    const original = history[key].bind(history);
    history[key] = function (data: unknown, unused: string, url?: string | URL | null): void {
      original(data, unused, url);
      window.dispatchEvent(new Event('fabrarian:locationchange'));
    };
  };
  patch('pushState');
  patch('replaceState');
  window.addEventListener('popstate', ensureDeckTab);
  window.addEventListener('fabrarian:locationchange', ensureDeckTab);

  // React to re-renders that (re)mount or drop the tab list.
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      ensureDeckTab();
    }, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
