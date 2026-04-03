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

export interface ScheduleData {
  channels: Channel[];
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
  showId: string;
  joinedAt: string;
}

// ============================================
// WebSocket Event Types
// ============================================

export interface WSJoinData {
  showId: string;
  userId: string;
  username: string;
}

export interface WSMessageData {
  showId: string;
  content: string;
}

export interface WSLeaveData {
  showId: string;
}

// ============================================
// API Response Types
// ============================================

export interface CurrentShowResponse {
  show: Show | null;
  timestamp: number;
  viewerCount: number;
}

export interface ScheduleResponse {
  currentShow: Show | null;
  upcomingShows: Show[];
  viewerCount: number;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
}
