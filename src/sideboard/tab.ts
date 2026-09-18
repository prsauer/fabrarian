// Injects a "Sideboard" tab into a deck page's react-tabs list and swaps in our
// own panel when it's active. react-tabs doesn't know about our tab, so we drive
// the selected-look and panel visibility ourselves, and keep it stable across the
// SPA's re-renders and client-side navigation.
import { deckIdFromPath } from '../config.js';
import { SideboardPanel } from './panel.js';

const TAB_MARK = 'data-fabrarian-sb-tab';
const CONTAINER_CLASS = 'fabrarian-sb-container';
const LABEL = 'Sideboard';
const ICON_VIEWBOX = '0 0 512 512';
// Font Awesome "right-left" (swap) glyph.
const ICON_PATH =
  'M32 96l320 0 0-64c0-12.9 7.8-24.6 19.8-29.6s25.7-2.2 34.9 6.9l96 96c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-96 96c-9.2 9.2-22.9 11.9-34.9 6.9S352 236.9 352 224l0-64L32 160c-17.7 0-32-14.3-32-32s14.3-32 32-32zM480 352c17.7 0 32 14.3 32 32s-14.3 32-32 32l-320 0 0 64c0 12.9-7.8 24.6-19.8 29.6s-25.7 2.2-34.9-6.9l-96-96c-6-6-9.4-14.1-9.4-22.6s3.4-16.6 9.4-22.6l96-96c9.2-9.2 22.9-11.9 34.9-6.9s19.8 16.6 19.8 29.6l0 64 320 0z';

let panel: SideboardPanel | null = null;
let panelDeckId: string | null = null;
let active = false;

function findTabList(): HTMLUListElement | null {
  return document.querySelector<HTMLUListElement>('ul.react-tabs__tab-list');
}

function reactTabsOf(list: HTMLUListElement): HTMLElement | null {
  return list.closest<HTMLElement>('.react-tabs');
}

function nativePanels(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.react-tabs__tab-panel'));
}

function getContainer(reactTabs: HTMLElement): HTMLElement {
  let container = reactTabs.querySelector<HTMLElement>(`.${CONTAINER_CLASS}`);
  if (!container) {
    container = document.createElement('div');
    container.className = CONTAINER_CLASS;
    container.style.display = 'none';
    reactTabs.appendChild(container);
  }
  return container;
}

function buildTab(list: HTMLUListElement): HTMLLIElement | null {
  const template =
    list.querySelector<HTMLLIElement>('li.react-tabs__tab:not(.react-tabs__tab--selected)') ??
    list.querySelector<HTMLLIElement>('li.react-tabs__tab');
  if (!template) return null;

  const li = template.cloneNode(true) as HTMLLIElement;
  li.removeAttribute('id');
  li.removeAttribute('aria-controls');
  li.removeAttribute('data-rttab'); // hide from react-tabs' own tab handling
  li.setAttribute('role', 'tab');
  li.setAttribute('tabindex', '0');
  li.setAttribute(TAB_MARK, '1');

  const svg = li.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', ICON_VIEWBOX);
    svg.setAttribute('data-icon', 'right-left');
    svg.querySelector('path')?.setAttribute('d', ICON_PATH);
  }
  const span = li.querySelector('span');
  if (span) {
    for (const node of Array.from(span.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) node.remove();
    }
    span.appendChild(document.createTextNode(` ${LABEL}`));
  }

  const activate = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    const deckId = deckIdFromPath(location.pathname);
    if (deckId) activateTab(deckId);
  };
  li.addEventListener('click', activate);
  li.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') activate(event);
  });
  return li;
}

function activateTab(deckId: string): void {
  const list = findTabList();
  const reactTabs = list && reactTabsOf(list);
  if (!list || !reactTabs) return;

  active = true;
  const container = getContainer(reactTabs);
  for (const p of nativePanels(reactTabs)) p.style.display = 'none';
  container.style.display = '';

  if (!panel || panelDeckId !== deckId) {
    panel = new SideboardPanel(container, deckId);
    panelDeckId = deckId;
    void panel.load();
  } else {
    // The deck may have been edited on fabrary's own tabs since we last looked;
    // re-fetch every time the tab is entered so the list is never stale.
    void panel.refresh();
  }
  applySelectedLook(list);
}

function deactivateTab(): void {
  active = false;
  const list = findTabList();
  const reactTabs = list && reactTabsOf(list);
  if (reactTabs) {
    for (const p of nativePanels(reactTabs)) p.style.display = '';
    const container = reactTabs.querySelector<HTMLElement>(`.${CONTAINER_CLASS}`);
    if (container) container.style.display = 'none';
  }
  list?.querySelector(`[${TAB_MARK}]`)?.classList.remove('react-tabs__tab--selected');
}

/** Make our tab look selected and the native ones not, while active. */
function applySelectedLook(list: HTMLUListElement): void {
  const ours = list.querySelector(`[${TAB_MARK}]`);
  if (!ours) return;
  for (const li of list.querySelectorAll('li.react-tabs__tab')) {
    li.classList.toggle('react-tabs__tab--selected', li === ours);
  }
}

/** Add/keep our tab, and enforce active state across re-renders. */
function ensureTab(): void {
  const deckId = deckIdFromPath(location.pathname);
  const existing = document.querySelector<HTMLElement>(`[${TAB_MARK}]`);

  if (!deckId) {
    existing?.remove();
    if (active) deactivateTab();
    return;
  }

  // Deck changed under us — reset the panel so it reloads for the new deck.
  if (panelDeckId && panelDeckId !== deckId) {
    if (active) deactivateTab();
    panel = null;
    panelDeckId = null;
  }

  const list = findTabList();
  if (!list) return;

  if (!existing || existing.parentElement !== list) {
    existing?.remove();
    const li = buildTab(list);
    if (li) list.appendChild(li);
  }

  if (active) {
    // A re-render may have recreated panels/tabs; re-assert our visible state.
    const reactTabs = reactTabsOf(list);
    if (reactTabs) {
      const container = getContainer(reactTabs);
      for (const p of nativePanels(reactTabs)) p.style.display = 'none';
      container.style.display = '';
    }
    applySelectedLook(list);
  }
}

export function installSideboardTab(): void {
  ensureTab();

  // When any real fabrary tab is clicked, hand control back to react-tabs.
  document.addEventListener(
    'click',
    (event) => {
      if (!active) return;
      const target = event.target as Element | null;
      const nativeTab = target?.closest('li.react-tabs__tab[data-rttab]');
      if (nativeTab) deactivateTab();
    },
    true,
  );

  const patch = (key: 'pushState' | 'replaceState'): void => {
    const original = history[key].bind(history);
    history[key] = function (data: unknown, unused: string, url?: string | URL | null): void {
      original(data, unused, url);
      window.dispatchEvent(new Event('fabrarian:locationchange'));
    };
  };
  patch('pushState');
  patch('replaceState');
  window.addEventListener('popstate', ensureTab);
  window.addEventListener('fabrarian:locationchange', ensureTab);

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      ensureTab();
    }, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
