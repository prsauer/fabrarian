// "Main deck" per hero: the reference list every other deck for that hero is
// diffed against. Stored in chrome.storage.sync (tiny, and it follows the
// user's Chrome profile), keyed by the hero card identifier.
import type { Deck } from './fab-api/types.js';

export interface MainDeck {
  /** Hero card identifier (fabrary slug, e.g. "fang-dracai-of-blades"). */
  heroIdentifier: string;
  heroName: string;
  deckId: string;
  deckName: string;
  /** Epoch ms when this was set. */
  savedAt: number;
}

export type MainDecks = Record<string, MainDeck>;

export const MAIN_DECKS_KEY = 'mainDecks';

export async function readMainDecks(): Promise<MainDecks> {
  const bag = await chrome.storage.sync.get(MAIN_DECKS_KEY);
  return (bag[MAIN_DECKS_KEY] as MainDecks | undefined) ?? {};
}

export async function writeMainDecks(decks: MainDecks): Promise<void> {
  await chrome.storage.sync.set({ [MAIN_DECKS_KEY]: decks });
}

/** Notify on any change to the main-deck table (from any extension page). */
export function onMainDecksChanged(listener: (decks: MainDecks) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !(MAIN_DECKS_KEY in changes)) return;
    listener((changes[MAIN_DECKS_KEY]?.newValue as MainDecks | undefined) ?? {});
  });
}

/** The hero key a deck files under (hero card identifier), or null if it has none. */
export function heroKeyOf(deck: Deck): string | null {
  return deck.heroIdentifier ?? deck.hero?.cardIdentifier ?? null;
}

/** Build the stored record for a deck, from a freshly fetched Deck. */
export function mainDeckFrom(deck: Deck): MainDeck | null {
  const heroIdentifier = heroKeyOf(deck);
  if (!heroIdentifier) return null;
  return {
    heroIdentifier,
    heroName: deck.hero?.name ?? heroIdentifier,
    deckId: deck.deckId,
    deckName: deck.name,
    savedAt: Date.now(),
  };
}

/** Accepts a fabrary deck URL or a bare deck id; returns the id or null. */
export function parseDeckRef(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const fromUrl = text.match(/\/decks\/([^/?#\s]+)/)?.[1];
  if (fromUrl) return fromUrl;
  return /^[A-Za-z0-9_-]+$/.test(text) ? text : null;
}

export function deckUrl(deckId: string): string {
  return `https://fabrary.net/decks/${encodeURIComponent(deckId)}`;
}
