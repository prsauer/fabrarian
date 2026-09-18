// User settings, persisted in chrome.storage.sync so they survive extension
// reloads and browser sessions (and follow the Chrome profile).

export interface Settings {
  /**
   * Whether the popup may hand the captured fabrary session token to
   * packrat.gg ("Open in packrat.gg"). Off by default: sending a session token
   * to a third party is something the user should opt into.
   */
  packratHandoff: boolean;
}

export const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  packratHandoff: false,
};

export async function readSettings(): Promise<Settings> {
  const bag = await chrome.storage.sync.get(SETTINGS_KEY);
  const stored = (bag[SETTINGS_KEY] as Partial<Settings> | undefined) ?? {};
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await readSettings()), ...patch };
  await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Notify on any settings change (from any extension page). */
export function onSettingsChanged(listener: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !(SETTINGS_KEY in changes)) return;
    const stored = (changes[SETTINGS_KEY]?.newValue as Partial<Settings> | undefined) ?? {};
    listener({ ...DEFAULT_SETTINGS, ...stored });
  });
}
