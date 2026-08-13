export interface StoredToken {
  /** The Cognito access token (JWT). */
  value: string;
  /** The Cognito refresh token, if present. */
  refreshValue: string | null;
  /** The Cognito username / sub (LastAuthUser) the tokens belong to. */
  username: string;
  /** Epoch ms the tokens were last read from localStorage. */
  capturedAt: number;
  /** Epoch ms from the access token's JWT `exp` claim, or null if unreadable. */
  expiresAt: number | null;
  /** Hostname the tokens were read from (fabrary.net / fabrary.com). */
  source: string;
}

export const TOKEN_KEY = 'fabraryToken';

export async function readToken(): Promise<StoredToken | null> {
  const bag = await chrome.storage.local.get(TOKEN_KEY);
  const stored = bag[TOKEN_KEY] as StoredToken | undefined;
  return stored ?? null;
}

export async function writeToken(token: StoredToken): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}

export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY);
}
