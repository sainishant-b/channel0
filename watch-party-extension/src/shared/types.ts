// ============================================
// Core Data Types
// ============================================

export interface Show {
  id: string;
  videoId: string;
  title: string;
  thumbnail?: string;
  duration: number; // seconds
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  recurring?: boolean;
  dayOfWeek?: string;
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  schedule: Show[];
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: string; // ISO 8601
  showId: string;
}

export interface UserSession {
  userId: string;
  username: string;
  joinedAt: string;
}

export interface WatchPartySession {
  channelId: string;
  channelCode: string;
  channelName: string;
  hostUserId: string;
  hostUsername: string;
  videoId: string | null;
  videoTitle: string | null;
  viewerCount: number;
  isHost: boolean;
  createdAt: string;
}

// ============================================
// Settings Types
// ============================================

export interface NotificationSettings {
  enabled: boolean;
  showStarting: boolean;
  reminderMinutes: number; // 5, 10, 15
  sound: boolean;
}

export interface AppearanceSettings {
  overlayPosition: 'right' | 'left';
  overlayWidth: number;
  autoCollapse: boolean;
}

export interface BehaviorSettings {
  autoSync: boolean;
  openInNewTab: boolean;
}

export interface Settings {
  notifications: NotificationSettings;
  appearance: AppearanceSettings;
  behavior: BehaviorSettings;
}

// ============================================
// State Types
// ============================================

export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';

export type SyncStatus = 'synced' | 'slightly-behind' | 'out-of-sync';

export interface OverlayState {
  isVisible: boolean;
  isCollapsed: boolean;
  currentShow: Show | null;
  messages: ChatMessage[];
  viewerCount: number;
  connectionStatus: ConnectionStatus;
  syncStatus: SyncStatus;
  currentTimestamp: number;
}
