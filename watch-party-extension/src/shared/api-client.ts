import { API_BASE_URL } from './constants';
import type { Show } from './types';

// ============================================
// API Response Types
// ============================================

interface ScheduleResponse {
  currentShow: Show | null;
  upcomingShows: Show[];
  viewerCount: number;
}

interface CurrentShowResponse {
  show: Show | null;
  timestamp: number;
  viewerCount: number;
}

interface CheckVideoResponse {
  isScheduled: boolean;
  show: Show | null;
  timestamp: number;
  viewerCount: number;
}

interface ChatHistoryResponse {
  messages: Array<{
    id: string;
    userId: string;
    username: string;
    message: string;
    timestamp: string;
    showId: string;
  }>;
}

// ============================================
// API Client
// ============================================

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }

  /**
   * Get the full schedule with current and upcoming shows
   */
  async getSchedule(): Promise<ScheduleResponse> {
    return this.fetch<ScheduleResponse>('/schedule');
  }

  /**
   * Get the currently playing show
   */
  async getCurrentShow(): Promise<CurrentShowResponse> {
    return this.fetch<CurrentShowResponse>('/schedule/current');
  }

  /**
   * Check if a video is currently scheduled
   */
  async checkVideo(videoId: string): Promise<CheckVideoResponse> {
    return this.fetch<CheckVideoResponse>(`/schedule/check/${videoId}`);
  }

  /**
   * Get chat history for a show
   */
  async getChatHistory(showId: string): Promise<ChatHistoryResponse> {
    return this.fetch<ChatHistoryResponse>(`/chat/${showId}/history`);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await fetch(`${this.baseUrl.replace('/api', '')}/health`);
    return response.json();
  }
}

export const apiClient = new ApiClient();
