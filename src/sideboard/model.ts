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
  /**
   * Canonical hero card identifiers for a hero matchup (a matchup can cover
   * several heroes); empty for archetype matchups and the base configuration.
   */
  heroIds: string[];
}

export function getConfigurations(deck: Deck): Configuration[] {
  const base: Configuration = { id: BASE_CONFIG_ID, name: 'Main deck', isBase: true, heroIds: [] };
  const matchups = deck.matchups.map((m) => ({
    id: m.matchupId,
    name: m.name,
    isBase: false,
    heroIds: [...new Set((m.heroIdentifiers ?? []).filter((h): h is string => !!h))],
  }));
  return [base, ...matchups];
}

/** Lowercase, accent-stripped alphanumerics only — for loose name comparisons. */
function foldChar(ch: string): string {
  return ch
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * How many leading characters of `text` spell out a prefix of `hero` (a hero
 * name or its slug), ignoring case, accents and punctuation, ending on a word
 * boundary in `text`. 0 if `text` doesn't start with part of the hero's name.
 */
function heroPrefixLength(text: string, hero: string): number {
  const heroChars = [...hero].map(foldChar).filter(Boolean);
  let h = 0;
  let matched = 0; // index in `text` just past the last matched word
  let sawWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = foldChar(text[i] ?? '');
    if (!c) {
      // Separator: everything up to here matched, so this is a valid cut point.
      if (sawWord) matched = i;
      continue;
    }
    if (h >= heroChars.length || heroChars[h] !== c) break;
    h += 1;
    sawWord = true;
    if (i === text.length - 1) matched = text.length;
  }
  return matched;
}

/**
 * The part of a matchup's name that isn't just its hero(es)' name(s): "Fang
 * (fatigue build)" for hero Fang → "(fatigue build)"; "Dori" for Dorinthea →
 * "" (a bare prefix of the hero's name carries no extra information). Hero
 * prefixes are stripped repeatedly so "Fang / Dori (aggro)" → "(aggro)".
 */
export function matchupExtraLabel(name: string, heroIds: string[]): string {
  if (!heroIds.length) return name.trim();
  let rest = name.trim();
  for (;;) {
    const cut = Math.max(0, ...heroIds.map((id) => heroPrefixLength(rest, id)));
    if (cut === 0) break;
    rest = rest.slice(cut).replace(/^[\s\-–—:,|/&+]+/, '');
  }
  return rest;
}

/** A deck stat that only matters for particular heroes (e.g. Fang's draconic reactions). */
export interface ConditionalStat {
  /** Short label for the stats bar. */
  label: string;
  /** Hover text spelling the label out. */
  title: string;
  /** Whether an in-deck card counts toward this stat. */
  matches: (dc: DeckCard) => boolean;
}

interface HeroStats {
  /** Which heroes this applies to — tested against the deck's hero identifier and name. */
  hero: (identifier: string, name: string) => boolean;
  stats: ConditionalStat[];
}

const hasAll = (list: (string | null)[] | null | undefined, ...wanted: string[]): boolean => {
  const have = lowerList(list);
  return wanted.every((w) => have.includes(w));
};

/** Hero-specific stats, in display order. Identifiers are fabrary card slugs. */
const HERO_STATS: HeroStats[] = [
  {
    // Fang, Dracai of Blades (and young Fang): cares about Draconic attack
    // reactions and Draconic instants (both can be played from the deck's
    // top-of-deck / reaction windows his abilities open).
    hero: (id, name) => /^fang(-|$)/.test(id) || /^fang/i.test(name),
    stats: [
      {
        label: 'Draconic AR/Inst',
        title: 'Draconic attack reactions + Draconic instants',
        matches: (dc) =>
          hasAll(dc.card.talents, 'draconic') &&
          (hasAll(dc.card.types, 'attack reaction') || hasAll(dc.card.types, 'instant')),
      },
    ],
  },
];

/** The conditional stats that apply to this deck's hero (empty for most heroes). */
export function conditionalStatsFor(deck: Deck): ConditionalStat[] {
  const id = (deck.heroIdentifier ?? deck.hero?.cardIdentifier ?? '').toLowerCase();
  const name = deck.hero?.name ?? '';
  return HERO_STATS.filter((h) => h.hero(id, name)).flatMap((h) => h.stats);
}

/** In-deck copies (for the configuration) matching a conditional stat. */
export function countMatching(deck: Deck, configId: string, stat: ConditionalStat): number {
  let n = 0;
  for (const dc of deck.deckCards) {
    if (!isDeckCard(dc) || !stat.matches(dc)) continue;
    n += effectiveQuantities(dc, configId).quantity;
  }
  return n;
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

/** Breakdown of the main-deck cards in the deck for a configuration. */
export interface DeckStats {
  /** Copies by pitch: 1 = red, 2 = yellow, 3 = blue. */
  red: number;
  yellow: number;
  blue: number;
  attackActions: number;
  nonAttackActions: number;
  attackReactions: number;
  defenseReactions: number;
  /** Attack actions with printed power of 6 or more. */
  bigAttacks: number;
  /** Sum of printed defense across all in-deck copies (cards with no block count 0). */
  totalBlock: number;
  /** In-deck copies with a printed defense value (the divisor for the average). */
  blockingCards: number;
  /** Mean defense over `blockingCards`, or 0 when nothing blocks. */
  averageBlock: number;
  /** Sum of "Arcane Barrier N" across the weapons/equipment currently equipped. */
  arcaneBarrier: number;
}

/** Power threshold for a "big" attack (Dominate-relevant, Fyendal's/blue-trigger-relevant). */
export const BIG_ATTACK_POWER = 6;

function lowerList(list: (string | null)[] | null | undefined): string[] {
  return (list ?? []).filter((t): t is string => !!t).map((t) => t.toLowerCase());
}

/** Card categorisation used by the stats bar (attack action / non-attack action / reactions). */
export function cardKind(
  dc: DeckCard,
): 'attack' | 'non-attack' | 'attack-reaction' | 'defense-reaction' | 'other' {
  const types = lowerList(dc.card.types);
  const subtypes = lowerList(dc.card.subtypes);
  if (types.includes('attack reaction')) return 'attack-reaction';
  if (types.includes('defense reaction')) return 'defense-reaction';
  if (types.includes('action')) return subtypes.includes('attack') ? 'attack' : 'non-attack';
  return 'other';
}

/** Printed power as a number, or null when blank/non-numeric (e.g. "*"). */
export function cardPower(dc: DeckCard): number | null {
  if (typeof dc.card.power === 'number') return dc.card.power;
  const special = dc.card.specialPower?.trim();
  if (special && /^\d+$/.test(special)) return Number(special);
  return null;
}

/**
 * The card's printed Arcane Barrier value, or 0. Gated on the keyword list so
 * cards that merely mention arcane barrier in reminder text don't count, and
 * reads the first "Arcane Barrier N" in the rules text.
 */
export function arcaneBarrier(dc: DeckCard): number {
  const hasKeyword = lowerList(dc.card.keywords).includes('arcane barrier');
  if (!hasKeyword) return 0;
  const m = /arcane barrier\s+(\d+)/i.exec(dc.card.functionalText ?? '');
  return m ? Number(m[1]) : 0;
}

export function statsFor(deck: Deck, configId: string): DeckStats {
  const stats: DeckStats = {
    red: 0,
    yellow: 0,
    blue: 0,
    attackActions: 0,
    nonAttackActions: 0,
    attackReactions: 0,
    defenseReactions: 0,
    bigAttacks: 0,
    totalBlock: 0,
    blockingCards: 0,
    averageBlock: 0,
    arcaneBarrier: 0,
  };
  for (const dc of deck.deckCards) {
    const n = effectiveQuantities(dc, configId).quantity;
    if (n <= 0) continue;
    if (!isDeckCard(dc)) {
      // Equipped gear (weapons + equipment slots) contributes its arcane barrier.
      const section = cardSection(dc);
      if (section !== 'Deck') stats.arcaneBarrier += arcaneBarrier(dc) * n;
      continue;
    }
    if (typeof dc.card.defense === 'number') {
      stats.totalBlock += dc.card.defense * n;
      stats.blockingCards += n;
    }
    switch (dc.card.pitch) {
      case 1:
        stats.red += n;
        break;
      case 2:
        stats.yellow += n;
        break;
      case 3:
        stats.blue += n;
        break;
    }
    switch (cardKind(dc)) {
      case 'attack':
        stats.attackActions += n;
        if ((cardPower(dc) ?? 0) >= BIG_ATTACK_POWER) stats.bigAttacks += n;
        break;
      case 'non-attack':
        stats.nonAttackActions += n;
        break;
      case 'attack-reaction':
        stats.attackReactions += n;
        break;
      case 'defense-reaction':
        stats.defenseReactions += n;
        break;
    }
  }
  stats.averageBlock = stats.blockingCards ? stats.totalBlock / stats.blockingCards : 0;
  return stats;
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
