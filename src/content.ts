// Content script (runs on fabrary.net / fabrary.com): reads the Amplify/Cognito
// tokens out of the page's localStorage and mirrors them into chrome.storage.local
// for the popup to hand off to packrat.gg. Re-checks on focus/visibility/storage
// events and on a light interval so token refreshes are picked up.
import { lastAuthUserKey, cognitoPrefix } from './config.js';
import { jwtExpiry } from './jwt.js';
import { readToken, writeToken, type StoredToken } from './storage.js';
import { installDeckTab } from './deck-tab.js';
import { installSideboardTab } from './sideboard/tab.js';
import { installDeckDiff } from './deck-diff/panel.js';

interface CognitoTokens {
  username: string;
  accessToken: string | null;
  refreshToken: string | null;
}

function readCognitoTokens(): CognitoTokens | null {
  const username = localStorage.getItem(lastAuthUserKey());
  if (!username) return null;
  const prefix = cognitoPrefix(username);
  const accessToken = localStorage.getItem(`${prefix}.accessToken`);
  const refreshToken = localStorage.getItem(`${prefix}.refreshToken`);
  if (!accessToken && !refreshToken) return null;
  return { username, accessToken, refreshToken };
}

async function sync(): Promise<void> {
  const tokens = readCognitoTokens();
  if (!tokens?.accessToken) return; // need at least an access token to be useful

  const existing = await readToken();
  const unchanged =
    existing?.value === tokens.accessToken && existing?.refreshValue === tokens.refreshToken;
  if (unchanged) return;

  const record: StoredToken = {
    value: tokens.accessToken,
    refreshValue: tokens.refreshToken,
    username: tokens.username,
    capturedAt: Date.now(),
    expiresAt: jwtExpiry(tokens.accessToken),
    source: location.hostname,
  };
  await writeToken(record);
  console.info('[fabrarian] mirrored fabrary Cognito tokens from localStorage');
}

const RECHECK_MS = 15_000;

void sync();
window.addEventListener('focus', () => void sync());
window.addEventListener('storage', () => void sync());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void sync();
});
setInterval(() => void sync(), RECHECK_MS);

// Inject the "Packrat" tab into deck pages.
installDeckTab();

// Inject the talishar-style "Sideboard" tab into deck pages.
installSideboardTab();

// Show the compact "vs main deck" diff in the margin of deck pages.
installDeckDiff();
