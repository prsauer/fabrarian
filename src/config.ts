/** Fabrary's Amplify/Cognito app client id — the tokens live under this key prefix. */
export const COGNITO_CLIENT_ID = '8b8pm28a6k25pdlgbp6c8eq4e';

/** Origins the content script runs on. Keep in sync with manifest content_scripts.matches. */
export const FABRARY_MATCHES = [
  'https://fabrary.net/*',
  'https://*.fabrary.net/*',
  'https://fabrary.com/*',
  'https://*.fabrary.com/*',
];

/**
 * Cognito stores tokens in localStorage as:
 *   CognitoIdentityServiceProvider.<clientId>.LastAuthUser              -> <sub>
 *   CognitoIdentityServiceProvider.<clientId>.<sub>.accessToken
 *   CognitoIdentityServiceProvider.<clientId>.<sub>.refreshToken
 *   CognitoIdentityServiceProvider.<clientId>.<sub>.idToken
 */
export function cognitoPrefix(sub: string): string {
  return `CognitoIdentityServiceProvider.${COGNITO_CLIENT_ID}.${sub}`;
}

export function lastAuthUserKey(): string {
  return `CognitoIdentityServiceProvider.${COGNITO_CLIENT_ID}.LastAuthUser`;
}

/**
 * Where the popup sends you: packrat.gg's /auth route. Both params are optional —
 * we include whichever token we've captured.
 */
export function packratUrl(accessToken: string | null, refreshToken: string | null): string {
  const params = new URLSearchParams();
  if (accessToken) params.set('token', accessToken);
  if (refreshToken) params.set('refreshToken', refreshToken);
  const query = params.toString();
  return query ? `https://packrat.gg/auth?${query}` : 'https://packrat.gg/auth';
}

/** packrat.gg's per-deck analysis page, opened by the injected deck tab. */
export function packratAnalyzeUrl(deckId: string): string {
  return `https://packrat.gg/analyze/${encodeURIComponent(deckId)}`;
}

/** Fabrary's AppSync GraphQL endpoint (Cognito-authed with the captured access token). */
export const FAB_GRAPHQL_ENDPOINT =
  'https://42xrd23ihbd47fjvsrt27ufpfe.appsync-api.us-east-2.amazonaws.com/graphql';

/** Card art CDN. `image` is a printing identifier like "EVR155-CF". */
export function cardImageUrl(image: string): string {
  return `https://content.fabrary.net/cards/${image}.webp`;
}

/** Hero display names whose icon slug differs from a plain slugify of the name. */
const HERO_SLUG_OVERRIDES: Record<string, string> = {
  Ira: 'ira-crimson-haze',
};

/**
 * Slug for a hero's icon/card identifier, derived from a matchup name when the
 * canonical `heroIdentifiers` aren't available (older matchups). A few short
 * names need an override.
 */
export function heroSlug(heroName: string): string {
  return (
    HERO_SLUG_OVERRIDES[heroName] ??
    heroName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

/** Circular hero icon on the fabrary CDN. Unknown heroes 404 — hide the icon on error. */
export function heroIconUrl(heroSlugOrId: string): string {
  return `https://content.fabrary.net/heroes/${heroSlugOrId}.webp`;
}

/** Pull the deck id out of a fabrary deck URL path, or null if it isn't one. */
export function deckIdFromPath(pathname: string): string | null {
  return pathname.match(/\/decks\/([^/?#]+)/)?.[1] ?? null;
}
