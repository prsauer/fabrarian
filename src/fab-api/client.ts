// Thin client for fabrary's AppSync GraphQL API. Runs in the content script on
// fabrary.net, so it reads the current Cognito access token straight from the
// page's localStorage (always fresh — fabrary itself keeps it renewed) and calls
// the same endpoint with the same `authorization: <accessToken>` header fabrary uses.
import { FAB_GRAPHQL_ENDPOINT, lastAuthUserKey, cognitoPrefix } from '../config.js';
import type { Card, Deck, DeckCard, DeckCardInput } from './types.js';

export class FabApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'no-token' | 'unauthorized' | 'graphql' | 'network',
  ) {
    super(message);
    this.name = 'FabApiError';
  }
}

/** Read the live Cognito access token that fabrary stores in localStorage. */
export function currentAccessToken(): string | null {
  const username = localStorage.getItem(lastAuthUserKey());
  if (!username) return null;
  return localStorage.getItem(`${cognitoPrefix(username)}.accessToken`);
}

type TokenSource = () => Promise<string | null> | string | null;
let tokenSource: TokenSource = currentAccessToken;

/**
 * Where the client gets its access token. The content script uses fabrary's
 * localStorage (the default); extension pages, which can't see it, use the
 * token mirrored into chrome.storage instead.
 */
export function setTokenSource(source: TokenSource): void {
  tokenSource = source;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = await tokenSource();
  if (!token) throw new FabApiError('Not signed in to fabrary.', 'no-token');

  let res: Response;
  try {
    res = await fetch(FAB_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: token },
      body: JSON.stringify({ query, variables }),
    });
  } catch (cause) {
    throw new FabApiError(`Network error: ${String(cause)}`, 'network');
  }

  if (res.status === 401 || res.status === 403) {
    throw new FabApiError('Fabrary rejected the token — reload the page and retry.', 'unauthorized');
  }

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    const message = json.errors.map((e) => e.message).join('; ');
    const unauthorized = /unauthorized|not authorized|token/i.test(message);
    throw new FabApiError(message, unauthorized ? 'unauthorized' : 'graphql');
  }
  if (!json.data) throw new FabApiError('Empty response from fabrary.', 'graphql');
  return json.data;
}

const GET_DECK = `
  query getDeck($deckId: ID!) {
    getDeck(deckId: $deckId) {
      deckId
      name
      format
      heroIdentifier
      hero { cardIdentifier name hero }
      matchups { matchupId name notes preferredTurnOrder heroIdentifiers }
      deckCards {
        cardIdentifier
        quantity
        sideboardQuantity
        maybeQuantity
        tokenQuantity
        printOverride
        matchupQuantities { matchupId quantity sideboardQuantity }
        card {
          cardIdentifier
          name
          pitch
          power
          specialPower
          cost
          defense
          types
          subtypes
          talents
          typeText
          functionalText
          keywords
          rarity
          defaultImage
          printings { print image }
        }
      }
    }
  }`;

export async function getDeck(deckId: string): Promise<Deck> {
  const data = await gql<{ getDeck: Deck }>(GET_DECK, { deckId });
  return data.getDeck;
}

const UPDATE_DECK_CARD = `
  mutation updateDeckCard($deckId: ID!, $cardIdentifier: ID!, $deckCard: DeckCardInput!) {
    updateDeckCard(deckId: $deckId, cardIdentifier: $cardIdentifier, deckCard: $deckCard) {
      cardIdentifier
      quantity
      sideboardQuantity
      maybeQuantity
      tokenQuantity
      printOverride
      matchupQuantities { matchupId quantity sideboardQuantity }
    }
  }`;

const GET_CARD = `
  query getCard($cardIdentifier: ID!) {
    getCard(cardIdentifier: $cardIdentifier) {
      cardIdentifier
      name
      defaultImage
    }
  }`;

/** Fetch a single card (used to resolve a hero's full-card art for hover previews). */
export async function getCard(cardIdentifier: string): Promise<Card> {
  const data = await gql<{ getCard: Card }>(GET_CARD, { cardIdentifier });
  return data.getCard;
}

export async function updateDeckCard(
  deckId: string,
  cardIdentifier: string,
  deckCard: DeckCardInput,
): Promise<DeckCard> {
  const data = await gql<{ updateDeckCard: DeckCard }>(UPDATE_DECK_CARD, {
    deckId,
    cardIdentifier,
    deckCard,
  });
  return data.updateDeckCard;
}
