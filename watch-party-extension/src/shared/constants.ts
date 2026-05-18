// ============================================
// Appwrite configuration
// ============================================
//
// These values must be supplied by the user after creating an Appwrite
// project. They are intentionally placeholders — see docs/PLAN.md §3
// "Open decisions" for bootstrap steps.

export const APPWRITE_ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';
export const APPWRITE_PROJECT_ID = '69ae7d60001c0117191e';
export const APPWRITE_DATABASE_ID = '69f977a80001f12a0a6f';

export const COLLECTION_IDS = {
  CHANNELS: 'channels',
  PLAYLIST_ITEMS: 'playlist_items',
  CHAT_MESSAGES: 'chat_messages',
  PRESENCE: 'presence',
} as const;

// ============================================
// Storage keys
// ============================================

export const STORAGE_KEYS = {
  USERNAME: 'watchparty_username',
  USER_ID: 'watchparty_userid',
  SETTINGS: 'watchparty_settings',
  ACTIVE_SESSION: 'watchparty_active_session',
  APPWRITE_SESSION: 'watchparty_appwrite_session',
} as const;

// ============================================
// Timing
// ============================================

export const TIMING = {
  KEEP_ALIVE_INTERVAL: 4 * 60 * 1000,        // service worker keep-alive
  PRESENCE_HEARTBEAT_INTERVAL: 20 * 1000,    // presence ping
  PRESENCE_TIMEOUT_MS: 60 * 1000,            // sweeper threshold
  SYNC_DRIFT_LOOP_MS: 1000,                  // viewer drift correction
  RECONNECT_BASE_DELAY: 1000,
  RECONNECT_MAX_DELAY: 30000,
} as const;

// ============================================
// Chat
// ============================================

export const CHAT = {
  MAX_MESSAGE_LENGTH: 300,
  MAX_HISTORY_MESSAGES: 200,
  RATE_LIMIT_MESSAGES: 5,
  RATE_LIMIT_WINDOW: 10000,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 20,
  USERNAME_PATTERN: /^[a-zA-Z0-9_]+$/,
} as const;

// ============================================
// Sync drift thresholds (seconds)
// ============================================

export const SYNC = {
  HARD_SNAP_THRESHOLD: 5,
  SOFT_NUDGE_THRESHOLD: 1,
} as const;

// ============================================
// Channel codes
// ============================================

export const CHANNEL_CODE = {
  LENGTH: 6,
  ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
} as const;

// ============================================
// Default settings
// ============================================

export const DEFAULT_SETTINGS = {
  appearance: {
    overlayPosition: 'right' as const,
    overlayWidth: 350,
    autoCollapse: false,
  },
  behavior: {
    autoSync: true,
    openInNewTab: true,
  },
};

// ============================================
// Alarm names
// ============================================

export const ALARMS = {
  KEEP_ALIVE: 'watchparty_keepalive',
  PRESENCE_HEARTBEAT: 'watchparty_presence_heartbeat',
  PRESENCE_SWEEP: 'watchparty_presence_sweep',
} as const;
