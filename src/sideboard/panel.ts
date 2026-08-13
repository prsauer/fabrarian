// The talishar-style sideboard panel: a matchup selector plus a card grid that
// shows one tile per registered copy. A copy in the deck is opaque; a copy in the
// sideboard is dimmed. Clicking a tile toggles that copy between deck and sideboard.
// Edits are optimistic and persisted per-card to fabrary via updateDeckCard,
// reverting on failure.
import { cardImageUrl, heroIconUrl, heroSlug } from '../config.js';
import { getCard, getDeck, updateDeckCard, FabApiError } from '../fab-api/client.js';
import type { Deck, DeckCard } from '../fab-api/types.js';
import {
  BASE_CONFIG_ID,
  cardImageId,
  cardSection,
  effectiveQuantities,
  getConfigurations,
  pool,
  SECTION_ORDER,
  setInDeck,
  sideboardableCards,
  totalsFor,
} from './model.js';
import { ensureStyles } from './styles.js';
import { attachHoverPreview, attachHoverPreviewLazy } from './hover-preview.js';

type Status = { kind: 'idle' | 'saving' | 'saved' | 'error'; text: string };

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

/** A small inline SVG icon (single rounded card) marking the base "Main deck" pill. */
function deckIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'fab-sb-base-icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z');
  svg.appendChild(path);
  return svg;
}

interface CardGroup {
  tiles: HTMLElement[];
  /** How many of this card's tiles are currently toggled into the deck. */
  onCount: () => number;
  /** Re-derive each tile's on/off from the card's stored count (used on revert). */
  syncFromData: () => void;
  /** Force every tile of this card on or off (used by slot radio selection). */
  setAll: (on: boolean) => void;
}

export class SideboardPanel {
  private deck: Deck | null = null;
  private configId = BASE_CONFIG_ID;
  private status: Status = { kind: 'idle', text: '' };
  private readonly groups = new Map<string, CardGroup>();
  /** Serialises saves per card so rapid clicks apply in order. */
  private readonly chains = new Map<string, Promise<unknown>>();
  /** hero identifier -> full-card art URL (null = none), for hover previews. */
  private readonly heroCards = new Map<string, string | null>();
  private countsEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly deckId: string,
  ) {
    ensureStyles();
  }

  async load(): Promise<void> {
    if (this.deck) return; // already loaded
    this.root.replaceChildren(h('div', { class: 'fab-sb-msg' }, ['Loading deck…']));
    try {
      this.deck = await getDeck(this.deckId);
      this.render();
    } catch (err) {
      this.renderError(err);
    }
  }

  private renderError(err: unknown): void {
    const msg =
      err instanceof FabApiError && err.kind === 'no-token'
        ? 'Sign in to fabrary to load this deck.'
        : err instanceof FabApiError && err.kind === 'unauthorized'
          ? 'Fabrary rejected your session. Reload the page and try again.'
          : `Could not load deck: ${err instanceof Error ? err.message : String(err)}`;
    const retry = h('button', { class: 'fab-sb-retry' }, ['Retry']);
    retry.addEventListener('click', () => {
      this.deck = null;
      void this.load();
    });
    this.root.replaceChildren(h('div', { class: 'fab-sb-msg is-error' }, [msg, retry]));
  }

  private targetDeckSize(): number {
    return /blitz/i.test(this.deck?.format ?? '') ? 40 : 60;
  }

  private render(): void {
    const deck = this.deck;
    if (!deck) return;
    this.groups.clear();

    const bar = this.renderBar(deck);

    // Split into equipment (grouped by slot) and the deck proper.
    const bySection = new Map<string, DeckCard[]>();
    const deckCards: DeckCard[] = [];
    for (const dc of sideboardableCards(deck)) {
      const section = cardSection(dc);
      if (section === 'Deck') {
        deckCards.push(dc);
      } else {
        const arr = bySection.get(section) ?? [];
        arr.push(dc);
        bySection.set(section, arr);
      }
    }

    const tilesFor = (cards: DeckCard[]): HTMLElement[] => {
      const out: HTMLElement[] = [];
      for (const dc of cards) {
        const group = this.buildGroup(dc);
        this.groups.set(dc.cardIdentifier, group);
        out.push(...group.tiles);
      }
      return out;
    };

    // Equipment band: slot groups laid out horizontally, wrapping to fill the width.
    // A FaB slot holds one item, so each slot is single-select: choosing a card
    // benches the others in that slot.
    const band = h('div', { class: 'fab-sb-equip' });
    for (const section of SECTION_ORDER) {
      if (section === 'Deck') continue;
      const slotCards = bySection.get(section);
      if (!slotCards?.length) continue;
      band.append(
        h('div', { class: 'fab-sb-slot' }, [
          h('div', { class: 'fab-sb-slot-title' }, [section]),
          h('div', { class: 'fab-sb-slot-tiles' }, this.buildSlot(slotCards)),
        ]),
      );
    }

    // Within the deck, list the base main-deck cards before the base sideboard
    // cards, keeping the existing pitch/name order as the tiebreak. This uses the
    // deck's base split (not the selected matchup), so the order is fixed and never
    // changes as you switch matchups. Purely a sort — the groups aren't separated.
    deckCards.sort((a, b) => {
      const ain = (a.quantity ?? 0) > 0 ? 0 : 1;
      const bin = (b.quantity ?? 0) > 0 ? 0 : 1;
      if (ain !== bin) return ain - bin;
      const ap = a.card.pitch ?? 99;
      const bp = b.card.pitch ?? 99;
      if (ap !== bp) return ap - bp;
      return a.card.name.localeCompare(b.card.name);
    });

    const children: Node[] = [bar];
    if (band.childElementCount) children.push(band);
    if (deckCards.length) {
      children.push(h('div', { class: 'fab-sb-section-title' }, ['Deck']));
      children.push(h('div', { class: 'fab-sb-grid' }, tilesFor(deckCards)));
    }

    this.root.replaceChildren(h('div', { class: 'fab-sb-panel' }, children));
    this.updateCounts();
  }

  private renderBar(deck: Deck): HTMLElement {
    const matchups = h('div', { class: 'fab-sb-matchups' });
    for (const cfg of getConfigurations(deck)) {
      const active = cfg.id === this.configId;

      if (cfg.isBase) {
        const pill = h('button', { class: 'fab-sb-pill is-base' + (active ? ' is-active' : '') }, [
          deckIcon(),
          h('span', { class: 'fab-sb-pill-label' }, [cfg.name]),
        ]);
        pill.addEventListener('click', () => this.selectConfig(cfg.id));
        matchups.append(pill);
        continue;
      }

      // Hero matchups render as a circular portrait; on a missing icon the pill
      // falls back to a text button (archetype / class matchups).
      const iconId = cfg.heroId ?? heroSlug(cfg.name);
      const icon = h('img', { class: 'fab-sb-hero', alt: cfg.name, src: heroIconUrl(iconId) });
      const label = h('span', { class: 'fab-sb-pill-label' }, [cfg.name]);
      const pill = h(
        'button',
        { class: 'fab-sb-pill fab-sb-pill-hero' + (active ? ' is-active' : ''), title: cfg.name },
        [icon, label],
      );
      icon.addEventListener('error', () => {
        icon.remove();
        pill.classList.remove('fab-sb-pill-hero'); // becomes a text pill
      });
      attachHoverPreviewLazy(pill, () => this.heroCardImage(iconId));
      pill.addEventListener('click', () => this.selectConfig(cfg.id));
      matchups.append(pill);
    }

    this.countsEl = h('div', { class: 'fab-sb-counts' });
    this.statusEl = h('div', { class: 'fab-sb-status' });
    return h('div', { class: 'fab-sb-bar' }, [matchups, this.countsEl, this.statusEl]);
  }

  private selectConfig(id: string): void {
    if (this.configId === id) return;
    this.configId = id;
    this.render();
  }

  /** Resolve (and cache) a hero's full-card art URL for the hover preview. */
  private async heroCardImage(heroIdentifier: string): Promise<string | null> {
    const cached = this.heroCards.get(heroIdentifier);
    if (cached !== undefined) return cached;
    let url: string | null = null;
    try {
      const card = await getCard(heroIdentifier);
      url = card.defaultImage ? cardImageUrl(card.defaultImage) : null;
    } catch {
      url = null;
    }
    this.heroCards.set(heroIdentifier, url);
    return url;
  }

  /**
   * Build one tile per registered copy. Without `onCardClick`, each tile is an
   * independent on/off toggle (deck cards). With it, a click delegates to the
   * caller (equipment slots use this for single-select radio behaviour).
   */
  private buildGroup(dc: DeckCard, onCardClick?: () => void): CardGroup {
    const img = cardImageId(dc);
    const total = pool(dc);
    const imageUrl = img ? cardImageUrl(img) : '';
    const bg = imageUrl ? `url("${imageUrl}")` : '';
    const tiles: HTMLElement[] = [];
    // Each tile's own in-deck state. Sum of `true`s is the card's in-deck count.
    const states: boolean[] = [];

    const paint = (i: number): void => {
      const tile = tiles[i];
      if (!tile) return;
      const on = states[i] ?? false;
      tile.classList.toggle('is-out', !on);
      tile.setAttribute('aria-pressed', String(on));
    };

    const initialIn = effectiveQuantities(dc, this.configId).quantity;
    for (let i = 0; i < total; i++) {
      states[i] = i < initialIn;
      const idx = i;
      // A "stub": the card's top art plus its bottom type-text strip, with the
      // middle text box cropped out — two crops of the same image stacked.
      const top = h('div', { class: 'fab-sb-crop fab-sb-crop-top' });
      const bottom = h('div', { class: 'fab-sb-crop fab-sb-crop-bottom' });
      if (bg) {
        top.style.backgroundImage = bg;
        bottom.style.backgroundImage = bg;
      }
      const art = h('div', { class: 'fab-sb-art' }, [top, bottom]);
      const tag = h('div', { class: 'fab-sb-tag' }, ['SB']);
      const tile = h(
        'div',
        { class: 'fab-sb-tile', role: 'button', tabindex: '0', 'aria-label': `${dc.card.name} copy` },
        [art, tag],
      );
      if (imageUrl) attachHoverPreview(tile, imageUrl);

      const toggle = (): void => {
        if (onCardClick) {
          onCardClick();
          return;
        }
        states[idx] = !states[idx];
        paint(idx);
        this.applyMove(dc, states.filter(Boolean).length);
      };
      tile.addEventListener('click', toggle);
      tile.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });
      tiles.push(tile);
      paint(i);
    }

    return {
      tiles,
      onCount: () => states.filter(Boolean).length,
      syncFromData: () => {
        const inDeck = effectiveQuantities(dc, this.configId).quantity;
        for (let i = 0; i < total; i++) {
          states[i] = i < inDeck;
          paint(i);
        }
      },
      setAll: (on: boolean) => {
        for (let i = 0; i < total; i++) {
          states[i] = on;
          paint(i);
        }
      },
    };
  }

  /** Build a single-select equipment slot: choosing a card benches its siblings. */
  private buildSlot(slotCards: DeckCard[]): HTMLElement[] {
    const entries: { dc: DeckCard; group: CardGroup }[] = [];
    const select = (clicked: DeckCard): void => {
      const alreadyIn = effectiveQuantities(clicked, this.configId).quantity > 0;
      // Clicking the selected item clears the slot; otherwise it becomes the pick.
      const chosen = alreadyIn ? null : clicked;
      for (const entry of entries) {
        const target = chosen && entry.dc === chosen ? pool(entry.dc) : 0;
        entry.group.setAll(target > 0);
        if (effectiveQuantities(entry.dc, this.configId).quantity !== target) {
          this.applyMove(entry.dc, target);
        }
      }
    };

    const tiles: HTMLElement[] = [];
    for (const dc of slotCards) {
      const group = this.buildGroup(dc, () => select(dc));
      this.groups.set(dc.cardIdentifier, group);
      entries.push({ dc, group });
      tiles.push(...group.tiles);
    }
    return tiles;
  }

  private updateCounts(): void {
    if (!this.deck || !this.countsEl) return;
    const { deckCards, sideboardCards } = totalsFor(this.deck, this.configId);
    const target = this.targetDeckSize();
    const legal = deckCards === target ? 'fab-sb-legal' : 'fab-sb-illegal';
    this.countsEl.replaceChildren(
      h('span', { class: legal }, [`Deck `, h('b', {}, [`${deckCards}`]), `/${target}`]),
      h('span', {}, [`Sideboard `, h('b', {}, [`${sideboardCards}`])]),
    );
    this.renderStatus();
  }

  private renderStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.className = `fab-sb-status is-${this.status.kind}`;
    this.statusEl.textContent = this.status.text;
  }

  private setStatus(kind: Status['kind'], text: string): void {
    this.status = { kind, text };
    this.renderStatus();
  }

  /** Persist a card's in-deck count for the active config. Tiles are already painted. */
  private applyMove(dc: DeckCard, targetInDeck: number): void {
    const total = pool(dc);
    const next = Math.max(0, Math.min(targetInDeck, total));
    const input = setInDeck(dc, this.configId, next);
    const snapshot = {
      quantity: dc.quantity,
      sideboardQuantity: dc.sideboardQuantity,
      matchupQuantities: dc.matchupQuantities.map((m) => ({ ...m })),
    };

    // Optimistic data update; the clicked tile has already repainted itself.
    dc.quantity = input.quantity;
    dc.sideboardQuantity = input.sideboardQuantity;
    dc.matchupQuantities = input.matchupQuantities.map((m) => ({ ...m }));
    this.updateCounts();
    this.setStatus('saving', 'Saving…');

    const prev = this.chains.get(dc.cardIdentifier) ?? Promise.resolve();
    const run = prev
      .catch(() => undefined)
      .then(() => updateDeckCard(this.deckId, dc.cardIdentifier, input))
      .then((saved) => {
        // Reconcile with fabrary's authoritative numbers.
        dc.quantity = saved.quantity;
        dc.sideboardQuantity = saved.sideboardQuantity;
        dc.maybeQuantity = saved.maybeQuantity;
        dc.matchupQuantities = saved.matchupQuantities.map((m) => ({ ...m }));
        // Only repaint if the server disagreed with the tiles' on-count.
        const group = this.groups.get(dc.cardIdentifier);
        if (group && group.onCount() !== effectiveQuantities(dc, this.configId).quantity) {
          group.syncFromData();
        }
        this.updateCounts();
        if (this.status.kind !== 'error') this.setStatus('saved', 'Saved');
      })
      .catch((err) => {
        // Revert the optimistic change and the tile that was toggled.
        dc.quantity = snapshot.quantity;
        dc.sideboardQuantity = snapshot.sideboardQuantity;
        dc.matchupQuantities = snapshot.matchupQuantities;
        this.groups.get(dc.cardIdentifier)?.syncFromData();
        this.updateCounts();
        this.setStatus('error', err instanceof FabApiError ? 'Save failed' : 'Error');
        console.error('[fabrarian] sideboard save failed', err);
      });
    this.chains.set(dc.cardIdentifier, run);
  }
}
