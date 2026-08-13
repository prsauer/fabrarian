// Service worker: keeps the toolbar badge in sync with whether a fabrary token
// has been captured. The capture itself happens in the content script, which
// reads Cognito's localStorage and writes to chrome.storage.local.
import { readToken, TOKEN_KEY } from './storage.js';

function badge(hasToken: boolean): void {
  chrome.action.setBadgeText({ text: hasToken ? '✓' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#2e7d32' });
}

async function refreshBadge(): Promise<void> {
  const token = await readToken();
  badge(Boolean(token));
}

chrome.runtime.onStartup.addListener(refreshBadge);
chrome.runtime.onInstalled.addListener(refreshBadge);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && TOKEN_KEY in changes) void refreshBadge();
});
