import {
  type UserSettings,
  type SessionState,
  DEFAULT_SETTINGS,
  DEFAULT_SESSION_STATE,
} from './types.ts';

const SETTINGS_KEY = 'meeting_copilot_settings';
const SESSION_KEY = 'meeting_copilot_session';

/**
 * Reads user settings from chrome.storage.local, merging with defaults
 * for any missing keys.
 */
export async function getSettings(): Promise<UserSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Partial<UserSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

/**
 * Writes user settings to chrome.storage.local.
 */
export async function saveSettings(settings: UserSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

/**
 * Reads the current session state, merging with defaults.
 */
export async function getSessionState(): Promise<SessionState> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  const stored = result[SESSION_KEY] as Partial<SessionState> | undefined;
  return { ...DEFAULT_SESSION_STATE, ...stored };
}

/**
 * Saves a partial session state update (merged with existing state).
 */
export async function saveSessionState(state: Partial<SessionState>): Promise<void> {
  const current = await getSessionState();
  const updated = { ...current, ...state };
  await chrome.storage.session.set({ [SESSION_KEY]: updated });
}

/**
 * Clears the session state back to defaults.
 */
export async function clearSessionState(): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY]: DEFAULT_SESSION_STATE });
}
