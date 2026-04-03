import type { Show, ChatMessage, Settings, WatchPartySession } from './types';

// ============================================
// Messages: Content Script → Service Worker
// ============================================

export type ContentToBackgroundMessage =
  | { type: 'CHECK_SCHEDULED'; videoId: string }
  | { type: 'GET_SCHEDULE' }
  | { type: 'GET_CURRENT_SHOW' }
  | { type: 'GET_NEXT_VIDEO' }
  | { type: 'JOIN_CHAT'; showId: string }
  | { type: 'LEAVE_CHAT'; showId: string }
  | { type: 'SEND_MESSAGE'; message: string; showId: string }
  | { type: 'SET_USERNAME'; username: string }
  | { type: 'GET_USERNAME' }
  | { type: 'GET_SETTINGS' }
  | { type: 'SYNC_REQUEST'; showId: string }
  | { type: 'SET_REMINDER'; showId: string; showTitle: string; startTime: string }
  | { type: 'GOOGLE_SIGN_IN' }
  | { type: 'GOOGLE_SIGN_OUT' }
  | { type: 'GET_GOOGLE_USER' }
  | { type: 'VIDEO_ENDED'; videoId: string; showId: string }
  | { type: 'HOST_CHANNEL'; channelName: string; videoUrl?: string }
  | { type: 'JOIN_CHANNEL'; channelCode: string }
  | { type: 'LEAVE_CHANNEL' }
  | { type: 'GET_SESSION_STATUS' };

// ============================================
// Messages: Service Worker → Content Script
// ============================================

export type BackgroundToContentMessage =
  | { type: 'SHOW_OVERLAY'; show: Show; messages: ChatMessage[] }
  | { type: 'HIDE_OVERLAY' }
  | { type: 'NEW_MESSAGE'; message: ChatMessage }
  | { type: 'SYNC_UPDATE'; timestamp: number; showId: string }
  | { type: 'USER_COUNT_UPDATE'; count: number; showId: string }
  | { type: 'CONNECTION_STATUS'; status: 'connected' | 'reconnecting' | 'disconnected' }
  | { type: 'SCHEDULE_UPDATE'; shows: Show[] }
  | { type: 'NAVIGATE_TO_VIDEO'; videoId: string; timestamp: number };

// ============================================
// Response Types
// ============================================

export interface CheckScheduledResponse {
  isScheduled: boolean;
  show: Show | null;
  currentTimestamp: number;
}

export interface GetScheduleResponse {
  currentShow: Show | null;
  upcomingShows: Show[];
  viewerCount: number;
}

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

// ============================================
// WebSocket Events (Client ↔ Server)
// ============================================

export interface WSJoinEvent {
  type: 'join';
  showId: string;
  userId: string;
  username: string;
}

export interface WSMessageEvent {
  type: 'message';
  showId: string;
  content: string;
}

export interface WSLeaveEvent {
  type: 'leave';
  showId: string;
}

export type WSClientEvent = WSJoinEvent | WSMessageEvent | WSLeaveEvent;

export interface WSWelcomeEvent {
  type: 'welcome';
  userId: string;
}

export interface WSNewMessageEvent {
  type: 'message';
  data: ChatMessage;
}

export interface WSUserCountEvent {
  type: 'userCount';
  showId: string;
  count: number;
}

export interface WSSyncEvent {
  type: 'sync';
  showId: string;
  timestamp: number;
}

export interface WSErrorEvent {
  type: 'error';
  code: string;
  message: string;
}

export type WSServerEvent = 
  | WSWelcomeEvent 
  | WSNewMessageEvent 
  | WSUserCountEvent 
  | WSSyncEvent 
  | WSErrorEvent;
