// A single shared floating card preview. Hovering a tile for HOVER_DELAY_MS shows
// a large, uncropped copy of the card next to it; leaving (or scrolling) hides it.
const CARD_RATIO = 762 / 546; // full-card height / width
export const HOVER_DELAY_MS = 850;

let root: HTMLDivElement | null = null;
let imgEl: HTMLImageElement | null = null;
let currentUrl = '';
let timer: number | null = null;

function ensure(): HTMLImageElement {
  if (root && imgEl) return imgEl;
  root = document.createElement('div');
  root.className = 'fab-sb-preview';
  imgEl = document.createElement('img');
  imgEl.alt = '';
  root.appendChild(imgEl);
  document.body.appendChild(root);
  // A fixed-positioned preview goes stale once the page scrolls, so drop it.
  window.addEventListener('scroll', hide, true);
  window.addEventListener('wheel', hide, { passive: true });
  return imgEl;
}

function hide(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  root?.classList.remove('is-visible');
}

function show(anchor: HTMLElement, url: string): void {
  const img = ensure();
  if (currentUrl !== url) {
    img.src = url;
    currentUrl = url;
  }

  const rect = anchor.getBoundingClientRect();
  const width = Math.min(300, window.innerWidth - 24);
  const height = width * CARD_RATIO;

  // Prefer the right of the tile; flip left if it would overflow.
  let left = rect.right + 14;
  if (left + width > window.innerWidth - 8) left = rect.left - width - 14;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

  let top = rect.top + rect.height / 2 - height / 2;
  top = Math.max(8, Math.min(top, window.innerHeight - height - 8));

  root!.style.left = `${left}px`;
  root!.style.top = `${top}px`;
  root!.style.width = `${width}px`;
  root!.classList.add('is-visible');
}

/** Show a full-card preview after a dwell when hovering `el`. */
export function attachHoverPreview(el: HTMLElement, url: string): void {
  el.addEventListener('mouseenter', () => {
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      show(el, url);
    }, HOVER_DELAY_MS);
  });
  el.addEventListener('mouseleave', hide);
  // A click changes deck state; don't leave a stale preview floating.
  el.addEventListener('click', hide);
}

/**
 * Like attachHoverPreview, but the image URL is resolved lazily on first dwell
 * (e.g. a hero card fetched on demand). Resolving to null shows nothing.
 */
export function attachHoverPreviewLazy(el: HTMLElement, resolve: () => Promise<string | null>): void {
  el.addEventListener('mouseenter', () => {
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(async () => {
      timer = null;
      const url = await resolve().catch(() => null);
      if (url && el.matches(':hover')) show(el, url);
    }, HOVER_DELAY_MS);
  });
  el.addEventListener('mouseleave', hide);
  el.addEventListener('click', hide);
}
