/** Best-effort read of a JWT's `exp` claim, in ms. Returns null for opaque tokens. */
export function jwtExpiry(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (!payload) return null;
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
    const claims = JSON.parse(json) as { exp?: unknown };
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}
