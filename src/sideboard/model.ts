// Pure sideboarding logic. Fabrary stores each matchup's numbers as *absolute
// overrides*: a card with no entry for a matchup keeps its base quantities
// (this mirrors fabrary's own `quantitiesFor`). Sideboarding redistributes a
// card's fixed pool (base quantity + base sideboard) between deck and sideboard.
import type { Deck, DeckCard, DeckCardInput, MatchupQuantity } from '../fab-api/types.js';

/** The synthetic configuration id for the deck's base (no matchup) numbers. */
export const BASE_CONFIG_ID = '__base__';

/** Card types that sit outside the 60-card deck and don't count toward its size. */
const NON_DECK_TYPES = new Set([
  'Hero',
  'Demi-Hero',
  'Weapon',
  'Equipment',
  'Token',
  'Macro',
  'Mentor',
  'Companion',
]);

export interface Quantities {
  quantity: number;
  sideboardQuantity: number;
}

export interface Configuration {
  id: string;
  name: string;
  isBase: boolean;
  /** Canonical hero card identifier for a hero matchup, or null (archetype / base). */
  heroId: string | null;
}

export function getConfigurations(deck: Deck): Configuration[] {
  const base: Configuration = { id: BASE_CONFIG_ID, name: 'Main deck', isBase: true, heroId: null };
  const matchups = deck.matchups.map((m) => ({
    id: m.matchupId,
    name: m.name,
    isBase: false,
    heroId: m.heroIdentifiers?.find((h): h is string => !!h) ?? null,
  }));
  return [base, ...matchups];
}

/** Copies of this card the player has registered — the pool sideboarding shuffles. */
export function pool(dc: DeckCard): number {
  return (dc.quantity ?? 0) + (dc.sideboardQuantity ?? 0);
}

/**
 * The image slug for a card's art. A `printOverride` is a print descriptor
 * (e.g. "FAB183-Gold-Extended Art"), not a URL slug, so it must be resolved to
 * its printing's `image` ("FAB183-GF"); otherwise fall back to the default image.
 */
export function cardImageId(dc: DeckCard): string | null {
  if (dc.printOverride) {
    const match = dc.card.printings?.find((p) => p?.print === dc.printOverride);
    if (match?.image) return match.image;
  }
  return dc.card.defaultImage ?? null;
}

/** Whether the card counts toward the main-deck size (excludes hero/equipment/tokens). */
export function isDeckCard(dc: DeckCard): boolean {
  const types = (dc.card.types ?? []).filter((t): t is string => !!t);
  return !types.some((t) => NON_DECK_TYPES.has(t));
}

/** Equipment slots, in the order players expect down the body. */
const SLOT_SUBTYPES = ['Head', 'Chest', 'Arms', 'Legs', 'Off-Hand'];

/** Display sections, top to bottom: weapons, each equipment slot, then the deck. */
export const SECTION_ORDER = ['Weapons', 'Head', 'Chest', 'Arms', 'Legs', 'Off-Hand', 'Equipment', 'Deck'];

/** Which section a card belongs to (weapon / equipment slot / the deck proper). */
export function cardSection(dc: DeckCard): string {
  if (isDeckCard(dc)) return 'Deck';
  const types = (dc.card.types ?? []).filter((t): t is string => !!t);
  const subtypes = (dc.card.subtypes ?? []).filter((t): t is string => !!t);
  if (types.includes('Weapon')) return 'Weapons';
  const slot = SLOT_SUBTYPES.find((s) => subtypes.includes(s));
  return slot ?? 'Equipment';
}

/** Effective quantities for a card under a configuration (matchup override, else base). */
export function effectiveQuantities(dc: DeckCard, configId: string): Quantities {
  if (configId !== BASE_CONFIG_ID) {
    const override = dc.matchupQuantities.find((m) => m.matchupId === configId);
    if (override) {
      return { quantity: override.quantity ?? 0, sideboardQuantity: override.sideboardQuantity ?? 0 };
    }
  }
  return { quantity: dc.quantity ?? 0, sideboardQuantity: dc.sideboardQuantity ?? 0 };
}

/** The full mutable slice of a DeckCard, for sending back unchanged fields. */
function baseInput(dc: DeckCard): DeckCardInput {
  return {
    quantity: dc.quantity ?? 0,
    sideboardQuantity: dc.sideboardQuantity ?? 0,
    maybeQuantity: dc.maybeQuantity ?? 0,
    tokenQuantity: dc.tokenQuantity ?? 0,
    printOverride: dc.printOverride ?? null,
    matchupQuantities: dc.matchupQuantities.map((m) => ({
      matchupId: m.matchupId,
      quantity: m.quantity ?? 0,
      sideboardQuantity: m.sideboardQuantity ?? 0,
    })),
  };
}

/**
 * Produce the DeckCardInput that sets this card's in-deck copies to `quantity`
 * for the given configuration, moving the remainder of the pool to the sideboard.
 * Base edits change the deck's base numbers; matchup edits upsert that matchup's
 * override and leave every other configuration untouched.
 */
export function setInDeck(dc: DeckCard, configId: string, quantity: number): DeckCardInput {
  const total = pool(dc);
  const q = Math.max(0, Math.min(quantity, total));
  const sb = total - q;
  const input = baseInput(dc);

  if (configId === BASE_CONFIG_ID) {
    input.quantity = q;
    input.sideboardQuantity = sb;
    return input;
  }

  const entry: MatchupQuantity = { matchupId: configId, quantity: q, sideboardQuantity: sb };
  const existing = input.matchupQuantities.findIndex((m) => m.matchupId === configId);
  if (existing >= 0) input.matchupQuantities[existing] = entry;
  else input.matchupQuantities.push(entry);
  return input;
}

export interface DeckTotals {
  /** Main-deck cards in the deck for this configuration (the "N" in N/60). */
  deckCards: number;
  /** Cards sitting in the sideboard for this configuration. */
  sideboardCards: number;
}

export function totalsFor(deck: Deck, configId: string): DeckTotals {
  const totals: DeckTotals = { deckCards: 0, sideboardCards: 0 };
  for (const dc of deck.deckCards) {
    if (!isDeckCard(dc)) continue;
    const eff = effectiveQuantities(dc, configId);
    totals.deckCards += eff.quantity;
    totals.sideboardCards += eff.sideboardQuantity;
  }
  return totals;
}

/** Cards that can be sideboarded (have at least one registered copy), sorted for display. */
export function sideboardableCards(deck: Deck): DeckCard[] {
  return deck.deckCards
    .filter((dc) => pool(dc) > 0)
    .sort((a, b) => {
      // Group by section (weapons, equipment slots, then deck), then pitch, then name.
      const as = SECTION_ORDER.indexOf(cardSection(a));
      const bs = SECTION_ORDER.indexOf(cardSection(b));
      if (as !== bs) return as - bs;
      const ap = a.card.pitch ?? 99;
      const bp = b.card.pitch ?? 99;
      if (ap !== bp) return ap - bp;
      return a.card.name.localeCompare(b.card.name);
    });
}
