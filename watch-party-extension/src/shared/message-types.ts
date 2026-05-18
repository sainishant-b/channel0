import type {
  ChannelDoc,
  ChannelVisibility,
  ChatMessage,
  PlaylistItem,
  Settings,
  WatchPartySession,
} from './types';

// ============================================
// Messages: popup / content script → service worker
// ============================================

export type ContentToBackgroundMessage =
  | { type: 'GET_USERNAME' }
  | { type: 'SET_USERNAME'; username: string }
  | { type: 'GET_SETTINGS' }
  | { type: 'SEND_CHAT'; text: string }
  | { type: 'GOOGLE_SIGN_IN' }
  | { type: 'GOOGLE_SIGN_OUT' }
  | { type: 'GET_GOOGLE_USER' }
  | { type: 'HOST_CHANNEL'; channelName: string; visibility: ChannelVisibility; videoUrl?: string }
  | { type: 'JOIN_CHANNEL'; channelCode: string }
  | { type: 'LEAVE_CHANNEL' }
  | { type: 'GET_SESSION_STATUS' }
  | { type: 'VIDEO_ENDED'; videoId: string }
  | { type: 'REPORT_VIDEO_DURATION'; videoId: string; duration: number }
  // Playlist CRUD
  | { type: 'LIST_PLAYLIST'; channelId: string }
  | { type: 'ADD_VIDEO'; channelId: string; videoUrl: string }
  | { type: 'REMOVE_VIDEO'; itemId: string }
  | { type: 'REORDER_VIDEO'; itemId: string; position: number }
  // Host lifecycle
  | { type: 'START_BROADCAST'; channelId: string }
  | { type: 'PAUSE_BROADCAST'; channelId: string }
  | { type: 'RESUME_BROADCAST'; channelId: string }
  | { type: 'SKIP_VIDEO'; channelId: string }
  | { type: 'STOP_BROADCAST'; channelId: string }
  // Channel browse / management
  | { type: 'LIST_OWNED_CHANNELS' }
  | { type: 'DELETE_CHANNEL'; channelId: string }
  | { type: 'ENTER_CHANNEL'; channelId: string }
  | { type: 'GET_CURRENT_CHANNEL' };

// ============================================
// Messages: service worker → content script
// ============================================

export type BackgroundToContentMessage =
  | { type: 'CHANNEL_UPDATE'; channel: ChannelDoc }
  | { type: 'BROADCAST_STOPPED'; channelId: string }
  | { type: 'NEW_MESSAGE'; message: ChatMessage }
  | { type: 'USER_COUNT_UPDATE'; count: number; channelId: string }
  | { type: 'CONNECTION_STATUS'; status: 'connected' | 'reconnecting' | 'disconnected' };

// ============================================
// Response types
// ============================================

export interface GetUsernameResponse {
  username: string | null;
  userId: string;
}

export interface GetSettingsResponse {
  settings: Settings;
}

export interface HostChannelResponse {
  success: boolean;
  session?: WatchPartySession;
  error?: string;
}

export interface JoinChannelResponse {
  success: boolean;
  session?: WatchPartySession;
  error?: string;
}

export interface SessionStatusResponse {
  active: boolean;
  session: WatchPartySession | null;
}

export interface PlaylistResponse {
  success: boolean;
  items?: PlaylistItem[];
  error?: string;
}

export interface MutationResponse {
  success: boolean;
  error?: string;
}

export interface OwnedChannelsResponse {
  success: boolean;
  channels?: ChannelDoc[];
  error?: string;
}

export interface EnterChannelResponse {
  success: boolean;
  session?: WatchPartySession;
  error?: string;
}

export interface CurrentChannelResponse {
  channel: (ChannelDoc & { currentVideoId?: string }) | null;
}
