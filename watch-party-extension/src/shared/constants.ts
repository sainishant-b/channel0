// ============================================
// API Configuration
// ============================================

export const API_BASE_URL = 'http://localhost:3001/api';
export const WS_URL = 'http://localhost:3001';

// ============================================
// Storage Keys
// ============================================

export const STORAGE_KEYS = {
  USERNAME: 'watchparty_username',
  USER_ID: 'watchparty_userid',
  SETTINGS: 'watchparty_settings',
  SCHEDULE_CACHE: 'watchparty_schedule',
  SCHEDULE_LAST_FETCH: 'watchparty_schedule_fetch',
  CHAT_HISTORY: 'watchparty_chat_history',
  ACTIVE_SESSION: 'watchparty_active_session',
} as const;

// ============================================
// Timing Constants
// ============================================

export const TIMING = {
  SCHEDULE_CACHE_DURATION: 6 * 60 * 60 * 1000, // 6 hours
  SYNC_BROADCAST_INTERVAL: 5000, // 5 seconds
  KEEP_ALIVE_INTERVAL: 4 * 60 * 1000, // 4 minutes
  RECONNECT_BASE_DELAY: 1000, // 1 second
  RECONNECT_MAX_DELAY: 30000, // 30 seconds
  PING_INTERVAL: 30000, // 30 seconds
  PING_TIMEOUT: 45000, // 45 seconds
} as const;

// ============================================
// Chat Constants
// ============================================

export const CHAT = {
  MAX_MESSAGE_LENGTH: 300,
  MAX_HISTORY_MESSAGES: 200,
  RATE_LIMIT_MESSAGES: 5,
  RATE_LIMIT_WINDOW: 10000, // 10 seconds
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 20,
  USERNAME_PATTERN: /^[a-zA-Z0-9_]+$/,
} as const;

// ============================================
// Sync Constants
// ============================================

export const SYNC = {
  SYNCED_THRESHOLD: 5, // seconds
  SLIGHTLY_BEHIND_THRESHOLD: 30, // seconds
} as const;

// ============================================
// Default Settings
// ============================================

export const DEFAULT_SETTINGS = {
  notifications: {
    enabled: true,
    showStarting: true,
    reminderMinutes: 5,
    sound: true,
  },
  appearance: {
    overlayPosition: 'right' as const,
    overlayWidth: 350,
    autoCollapse: false,
  },
  behavior: {
    autoSync: false,
    openInNewTab: true,
  },
};

// ============================================
// Alarm Names
// ============================================

export const ALARMS = {
  KEEP_ALIVE: 'watchparty_keepalive',
  SCHEDULE_REFRESH: 'watchparty_schedule_refresh',
  SHOW_REMINDER: 'watchparty_reminder_',
} as const;
