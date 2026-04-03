import { STORAGE_KEYS, DEFAULT_SETTINGS, CHAT } from './constants';
import type { Settings } from './types';

// ============================================
// User ID Management
// ============================================

function generateUserId(): string {
  return 'user_' + crypto.randomUUID().replace(/-/g, '').substring(0, 12);
}

export async function getUserId(): Promise<string> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.USER_ID);
  
  if (result[STORAGE_KEYS.USER_ID]) {
    return result[STORAGE_KEYS.USER_ID];
  }
  
  const newUserId = generateUserId();
  await chrome.storage.sync.set({ [STORAGE_KEYS.USER_ID]: newUserId });
  return newUserId;
}

// ============================================
// Username Management
// ============================================

export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username) {
    return { valid: false, error: 'Username is required' };
  }
  
  if (username.length < CHAT.USERNAME_MIN_LENGTH) {
    return { valid: false, error: `Username must be at least ${CHAT.USERNAME_MIN_LENGTH} characters` };
  }
  
  if (username.length > CHAT.USERNAME_MAX_LENGTH) {
    return { valid: false, error: `Username must be at most ${CHAT.USERNAME_MAX_LENGTH} characters` };
  }
  
  if (!CHAT.USERNAME_PATTERN.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
  }
  
  return { valid: true };
}

export async function getUsername(): Promise<string | null> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.USERNAME);
  return result[STORAGE_KEYS.USERNAME] || null;
}

export async function setUsername(username: string): Promise<void> {
  const validation = validateUsername(username);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  await chrome.storage.sync.set({ [STORAGE_KEYS.USERNAME]: username });
}

// ============================================
// Settings Management
// ============================================

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  const stored = result[STORAGE_KEYS.SETTINGS];
  
  if (!stored) {
    return DEFAULT_SETTINGS;
  }
  
  // Merge with defaults to handle new settings added in updates
  return {
    notifications: { ...DEFAULT_SETTINGS.notifications, ...stored.notifications },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...stored.appearance },
    behavior: { ...DEFAULT_SETTINGS.behavior, ...stored.behavior },
  };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  const updated = {
    notifications: { ...current.notifications, ...settings.notifications },
    appearance: { ...current.appearance, ...settings.appearance },
    behavior: { ...current.behavior, ...settings.behavior },
  };
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: updated });
}

// ============================================
// Schedule Cache
// ============================================

export async function getCachedSchedule<T>(): Promise<{ data: T; timestamp: number } | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.SCHEDULE_CACHE,
    STORAGE_KEYS.SCHEDULE_LAST_FETCH,
  ]);
  
  if (!result[STORAGE_KEYS.SCHEDULE_CACHE]) {
    return null;
  }
  
  return {
    data: result[STORAGE_KEYS.SCHEDULE_CACHE],
    timestamp: result[STORAGE_KEYS.SCHEDULE_LAST_FETCH] || 0,
  };
}

export async function setCachedSchedule<T>(data: T): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SCHEDULE_CACHE]: data,
    [STORAGE_KEYS.SCHEDULE_LAST_FETCH]: Date.now(),
  });
}

// ============================================
// Chat History Cache
// ============================================

export async function getChatHistory(showId: string): Promise<unknown[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CHAT_HISTORY);
  const history = result[STORAGE_KEYS.CHAT_HISTORY] || {};
  return history[showId] || [];
}

export async function saveChatHistory(showId: string, messages: unknown[]): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CHAT_HISTORY);
  const history = result[STORAGE_KEYS.CHAT_HISTORY] || {};
  
  // Keep only last N messages
  history[showId] = messages.slice(-CHAT.MAX_HISTORY_MESSAGES);
  
  await chrome.storage.local.set({ [STORAGE_KEYS.CHAT_HISTORY]: history });
}

// ============================================
// Active Session Management
// ============================================

import type { WatchPartySession } from './types';

export async function getActiveSession(): Promise<WatchPartySession | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_SESSION);
  return result[STORAGE_KEYS.ACTIVE_SESSION] || null;
}

export async function saveActiveSession(session: WatchPartySession): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_SESSION]: session });
}

export async function clearActiveSession(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.ACTIVE_SESSION);
}
