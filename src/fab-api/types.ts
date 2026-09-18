// Types for the fabrary AppSync GraphQL API, scoped to what the sideboard needs.
// Field shapes mirror fabrary's own getDeck query / DeckCard fragment.

export interface MatchupQuantity {
  matchupId: string;
  quantity: number;
  sideboardQuantity: number;
}

export interface Matchup {
  matchupId: string;
  name: string;
  notes?: string | null;
  preferredTurnOrder?: string | null;
  /** Hero card identifiers for a hero matchup; null/empty for archetype matchups. */
  heroIdentifiers?: (string | null)[] | null;
}

export interface Printing {
  /** Human-facing print descriptor, e.g. "FAB183-Gold-Extended Art". Matches printOverride. */
  print?: string | null;
  /** Image slug for the card art URL, e.g. "FAB183-GF". */
  image?: string | null;
  identifier?: string | null;
}

export interface Card {
  cardIdentifier: string;
  name: string;
  pitch?: number | null;
  power?: number | null;
  specialPower?: string | null;
  cost?: number | null;
  defense?: number | null;
  types?: (string | null)[] | null;
  subtypes?: (string | null)[] | null;
  /** Talents, e.g. ["Draconic"], ["Shadow", "Runeblade"]. */
  talents?: (string | null)[] | null;
  typeText?: string | null;
  /** Rules text with markdown-ish emphasis, e.g. "**Arcane Barrier 2** *(…)*". */
  functionalText?: string | null;
  /** Keyword names on the card, e.g. ["Arcane Barrier", "Blade Break"]. */
  keywords?: (string | null)[] | null;
  rarity?: string | null;
  /** Image slug of the default printing (e.g. "PEN309"), used to build the art URL. */
  defaultImage?: string | null;
  printings?: (Printing | null)[] | null;
}

export interface DeckCard {
  cardIdentifier: string;
  deckId?: string;
  quantity: number;
  sideboardQuantity: number;
  maybeQuantity: number;
  tokenQuantity?: number | null;
  printOverride?: string | null;
  matchupQuantities: MatchupQuantity[];
  card: Card;
}

export interface Deck {
  deckId: string;
  name: string;
  format?: string | null;
  heroIdentifier?: string | null;
  hero?: { cardIdentifier?: string | null; name?: string | null; hero?: string | null } | null;
  matchups: Matchup[];
  deckCards: DeckCard[];
}

/** The mutable slice of a DeckCard that `updateDeckCard` accepts. */
export interface DeckCardInput {
  quantity: number;
  sideboardQuantity: number;
  maybeQuantity: number;
  tokenQuantity?: number | null;
  printOverride?: string | null;
  matchupQuantities: MatchupQuantity[];
}
