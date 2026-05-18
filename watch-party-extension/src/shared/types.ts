// ============================================
// Appwrite document base
// ============================================

/**
 * Fields Appwrite injects on every stored document. Our typed records
 * extend this so the SDK's generic constraints (`T extends Models.Document`)
 * accept them when used as `databases.getDocument<T>(...)`.
 */
export interface AppwriteDocument {
  $id: string;
  $sequence: string;
  $collectionId: string;
  $databaseId: string;
  $createdAt: string;
  $updatedAt: string;
  $permissions: string[];
}

// ============================================
// Channel + Playlist
// ============================================

export type ChannelState = 'playing' | 'paused' | 'stopped';
export type ChannelVisibility = 'public' | 'private';

/**
 * The authoritative server-side channel document. Mirrors the Appwrite
 * `channels` collection. Clients derive the playback clock from the
 * timing fields below; see docs/PLAN.md §6.
 */
export interface ChannelDoc extends AppwriteDocument {
  code: string;
  name: string;
  description: string | null;
  visibility: ChannelVisibility;
  hostUserId: string;
  hostUsername: string;
  state: ChannelState;
  currentVideoIndex: number;
  currentVideoStartedAt: string | null;
  pauseAccumMs: number;
  pausedAt: string | null;
  viewerCount: number;
  createdAt: string;
}

export interface PlaylistItem extends AppwriteDocument {
  channelId: string;
  position: number;
  videoId: string;
  videoTitle: string;
  videoDuration: number | null;
  addedAt: string;
}

// ============================================
// Chat
// ============================================

export interface ChatMessage extends AppwriteDocument {
  channelId: string;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
}

// ============================================
// Local session (popup ↔ service worker)
// ============================================

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
// Settings
// ============================================

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
  appearance: AppearanceSettings;
  behavior: BehaviorSettings;
}

// ============================================
// Connection / sync state
// ============================================

export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';

export type SyncStatus = 'synced' | 'slightly-behind' | 'out-of-sync';
