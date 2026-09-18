// Pure card-list diff between a deck and the hero's main deck. Compares each
// card's total registered copies (deck + sideboard together) — the split
// between main deck and sideboard is deliberately ignored.
import type { Deck, DeckCard } from '../fab-api/types.js';
import { cardImageId, pool } from '../sideboard/model.js';

export interface DiffLine {
  cardIdentifier: string;
  name: string;
  pitch: number | null;
  /** Card art slug for the hover preview, if any. */
  image: string | null;
  /** Copies in this deck minus copies in the main deck (never 0). */
  delta: number;
}

export interface DeckDiff {
  /** Cards this deck has more of than the main deck. */
  added: DiffLine[];
  /** Cards this deck has fewer of than the main deck. */
  removed: DiffLine[];
  addedCopies: number;
  removedCopies: number;
}

/** Cards that don't belong in a list diff: the hero itself and generated tokens. */
function isDiffable(dc: DeckCard): boolean {
  const types = (dc.card.types ?? []).filter((t): t is string => !!t);
  return !types.some((t) => t === 'Hero' || t === 'Token' || t === 'Macro');
}

export function diffDecks(main: Deck, current: Deck): DeckDiff {
  const byId = new Map<string, { dc: DeckCard; main: number; current: number }>();
  const note = (dc: DeckCard, side: 'main' | 'current'): void => {
    if (!isDiffable(dc)) return;
    const n = pool(dc);
    if (n <= 0) return;
    const entry = byId.get(dc.cardIdentifier) ?? { dc, main: 0, current: 0 };
    entry[side] += n;
    byId.set(dc.cardIdentifier, entry);
  };
  for (const dc of main.deckCards) note(dc, 'main');
  for (const dc of current.deckCards) note(dc, 'current');

  const diff: DeckDiff = { added: [], removed: [], addedCopies: 0, removedCopies: 0 };
  for (const { dc, main: m, current: c } of byId.values()) {
    const delta = c - m;
    if (delta === 0) continue;
    const line: DiffLine = {
      cardIdentifier: dc.cardIdentifier,
      name: dc.card.name,
      pitch: dc.card.pitch ?? null,
      image: cardImageId(dc),
      delta,
    };
    if (delta > 0) {
      diff.added.push(line);
      diff.addedCopies += delta;
    } else {
      diff.removed.push(line);
      diff.removedCopies -= delta;
    }
  }
  const order = (a: DiffLine, b: DiffLine): number =>
    (a.pitch ?? 99) - (b.pitch ?? 99) || a.name.localeCompare(b.name);
  diff.added.sort(order);
  diff.removed.sort(order);
  return diff;
}
