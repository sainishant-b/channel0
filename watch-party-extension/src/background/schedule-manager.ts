import { apiClient } from '@shared/api-client';
import type { Show, Channel } from '@shared/types';

const CACHE_KEY = 'watchparty_schedule_cache';
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

interface CachedSchedule {
  channels: Channel[];
  timestamp: number;
}

class ScheduleManager {
  private schedule: Channel[] = [];
  private lastFetch: number = 0;

  async initialize(): Promise<void> {
    // Try to load from cache first
    const cached = await this.loadCachedSchedule();
    if (cached) {
      this.schedule = cached.channels;
      this.lastFetch = cached.timestamp;
      console.log('[ScheduleManager] Loaded from cache');
    }
    
    // Fetch fresh data if cache is stale
    if (this.isCacheStale()) {
      await this.fetchSchedule();
    }
  }

  private isCacheStale(): boolean {
    return Date.now() - this.lastFetch > CACHE_DURATION;
  }

  async fetchSchedule(): Promise<Channel[]> {
    try {
      console.log('[ScheduleManager] Fetching schedule from server');
      const response = await apiClient.getSchedule();
      
      // The API returns { currentShow, upcomingShows, viewerCount }
      // We need to reconstruct the channel structure
      const shows: Show[] = [];
      if (response.currentShow) {
        shows.push(response.currentShow);
      }
      shows.push(...response.upcomingShows);
      
      this.schedule = [{
        id: 'main',
        name: 'Main Channel',
        schedule: shows,
      }];
      
      this.lastFetch = Date.now();
      await this.cacheSchedule();
      
      return this.schedule;
    } catch (error) {
      console.error('[ScheduleManager] Failed to fetch schedule:', error);
      return this.schedule;
    }
  }

  async getSchedule(): Promise<Channel[]> {
    if (this.isCacheStale()) {
      await this.fetchSchedule();
    }
    return this.schedule;
  }

  getCurrentShow(channelId: string = 'main'): Show | null {
    const channel = this.schedule.find(c => c.id === channelId);
    if (!channel) return null;

    const now = Date.now();
    return channel.schedule.find(show => {
      const startTime = new Date(show.startTime).getTime();
      const endTime = new Date(show.endTime).getTime();
      return now >= startTime && now <= endTime;
    }) || null;
  }

  getUpcomingShows(channelId: string = 'main', limit: number = 5): Show[] {
    const channel = this.schedule.find(c => c.id === channelId);
    if (!channel) return [];

    const now = Date.now();
    return channel.schedule
      .filter(show => new Date(show.startTime).getTime() > now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, limit);
  }

  getNextShow(channelId: string = 'main'): Show | null {
    const upcoming = this.getUpcomingShows(channelId, 1);
    return upcoming[0] || null;
  }

  isVideoScheduled(videoId: string): Show | null {
    const now = Date.now();
    
    for (const channel of this.schedule) {
      const show = channel.schedule.find(s => s.videoId === videoId);
      if (show) {
        const startTime = new Date(show.startTime).getTime();
        const endTime = new Date(show.endTime).getTime();
        
        if (now >= startTime && now <= endTime) {
          return show;
        }
      }
    }
    
    return null;
  }

  calculateCurrentTimestamp(show: Show): number {
    const now = Date.now();
    const startTime = new Date(show.startTime).getTime();
    const elapsedSeconds = Math.floor((now - startTime) / 1000);
    return Math.max(0, Math.min(elapsedSeconds, show.duration));
  }

  private async cacheSchedule(): Promise<void> {
    try {
      const cache: CachedSchedule = {
        channels: this.schedule,
        timestamp: this.lastFetch,
      };
      await chrome.storage.local.set({ [CACHE_KEY]: cache });
      console.log('[ScheduleManager] Schedule cached');
    } catch (error) {
      console.error('[ScheduleManager] Failed to cache schedule:', error);
    }
  }

  private async loadCachedSchedule(): Promise<CachedSchedule | null> {
    try {
      const result = await chrome.storage.local.get(CACHE_KEY);
      return result[CACHE_KEY] || null;
    } catch (error) {
      console.error('[ScheduleManager] Failed to load cached schedule:', error);
      return null;
    }
  }
}

export const scheduleManager = new ScheduleManager();
