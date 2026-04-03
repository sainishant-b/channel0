import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ScheduleData, Show, Channel } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface QueueItem {
  id: string;
  videoId: string;
  title: string;
  duration: number;
  addedAt: number;
}

class ScheduleService {
  private scheduleData: ScheduleData;
  private lastLoadTime: number = 0;
  private readonly RELOAD_INTERVAL = 60000;
  private serverStartTime: number = Date.now();
  
  // Dynamic queue management
  private queue: QueueItem[] = [];
  private currentIndex: number = 0;
  private currentShowStartTime: number = Date.now();
  private readonly DEFAULT_DURATION = 3600; // 1 hour default

  constructor() {
    this.scheduleData = { channels: [] };
    this.loadSchedule();
    this.initializeQueueFromSchedule();
  }

  private loadSchedule(): void {
    try {
      const schedulePath = join(__dirname, '..', 'data', 'schedule.json');
      const data = readFileSync(schedulePath, 'utf-8');
      this.scheduleData = JSON.parse(data);
      this.lastLoadTime = Date.now();
      console.log('[Schedule] Loaded schedule with', this.getTotalShows(), 'shows');
    } catch (error) {
      console.error('[Schedule] Failed to load schedule:', error);
      this.scheduleData = { channels: [] };
    }
  }

  private initializeQueueFromSchedule(): void {
    // Load initial queue from schedule.json
    const mainChannel = this.scheduleData.channels.find(c => c.id === 'main');
    if (mainChannel) {
      this.queue = mainChannel.schedule.map(show => ({
        id: show.id,
        videoId: show.videoId,
        title: show.title,
        duration: show.duration,
        addedAt: Date.now(),
      }));
    }
    console.log('[Schedule] Initialized queue with', this.queue.length, 'items');
  }

  private maybeReloadSchedule(): void {
    if (Date.now() - this.lastLoadTime > this.RELOAD_INTERVAL) {
      this.loadSchedule();
    }
  }

  private getTotalShows(): number {
    return this.scheduleData.channels.reduce(
      (total, channel) => total + channel.schedule.length,
      0
    );
  }

  // ============================================
  // Queue Management
  // ============================================

  getQueue(): QueueItem[] {
    return [...this.queue];
  }

  addToQueue(videoId: string, title?: string, duration?: number): QueueItem {
    const item: QueueItem = {
      id: `show_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      videoId,
      title: title || `Video ${videoId}`,
      duration: duration || this.DEFAULT_DURATION,
      addedAt: Date.now(),
    };
    
    this.queue.push(item);
    this.saveQueueToFile();
    console.log('[Schedule] Added to queue:', item.title);
    
    return item;
  }

  removeFromQueue(showId: string): boolean {
    const index = this.queue.findIndex(item => item.id === showId);
    if (index === -1) return false;
    
    // Don't allow removing currently playing show
    if (index === this.currentIndex) {
      return false;
    }
    
    this.queue.splice(index, 1);
    
    // Adjust current index if needed
    if (index < this.currentIndex) {
      this.currentIndex--;
    }
    
    this.saveQueueToFile();
    console.log('[Schedule] Removed from queue:', showId);
    return true;
  }

  reorderQueue(showIds: string[]): void {
    const newQueue: QueueItem[] = [];
    
    for (const id of showIds) {
      const item = this.queue.find(q => q.id === id);
      if (item) {
        newQueue.push(item);
      }
    }
    
    // Add any items that weren't in the reorder list
    for (const item of this.queue) {
      if (!newQueue.find(q => q.id === item.id)) {
        newQueue.push(item);
      }
    }
    
    this.queue = newQueue;
    this.saveQueueToFile();
    console.log('[Schedule] Queue reordered');
  }

  skipCurrent(): void {
    if (this.queue.length > 0) {
      this.currentIndex = (this.currentIndex + 1) % this.queue.length;
      this.currentShowStartTime = Date.now();
      console.log('[Schedule] Skipped to next show');
    }
  }

  clearQueue(): void {
    this.queue = [];
    this.currentIndex = 0;
    this.currentShowStartTime = Date.now();
    this.saveQueueToFile();
    console.log('[Schedule] Queue cleared');
  }

  private saveQueueToFile(): void {
    try {
      const schedulePath = join(__dirname, '..', 'data', 'schedule.json');
      const data: ScheduleData = {
        channels: [{
          id: 'main',
          name: 'Main Channel',
          description: 'Your daily watch party programming',
          schedule: this.queue.map(item => ({
            id: item.id,
            videoId: item.videoId,
            title: item.title,
            duration: item.duration,
            startTime: new Date().toISOString(),
            endTime: new Date(Date.now() + item.duration * 1000).toISOString(),
            recurring: false,
          })),
        }],
      };
      writeFileSync(schedulePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[Schedule] Failed to save queue:', error);
    }
  }

  // ============================================
  // Show Retrieval with Auto-advancement
  // ============================================

  private checkAndAdvanceShow(): boolean {
    if (this.queue.length === 0) return false;
    
    const currentItem = this.queue[this.currentIndex];
    if (!currentItem) return false;
    
    const elapsed = Date.now() - this.currentShowStartTime;
    const durationMs = currentItem.duration * 1000;
    
    // Auto-advance to next show when current one ends
    if (elapsed >= durationMs) {
      // Don't loop - stop at the last video
      if (this.currentIndex < this.queue.length - 1) {
        this.currentIndex++;
        this.currentShowStartTime = Date.now();
        const newShow = this.queue[this.currentIndex];
        console.log('[Schedule] Auto-advanced to show:', newShow?.title);
        return true; // Return true to indicate a change happened
      } else {
        console.log('[Schedule] Reached end of queue, staying on last video');
      }
    }
    
    return false;
  }

  private queueItemToShow(item: QueueItem, startTime: number): Show {
    return {
      id: item.id,
      videoId: item.videoId,
      title: item.title,
      duration: item.duration,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(startTime + item.duration * 1000).toISOString(),
      recurring: false,
    };
  }

  getChannels(): Channel[] {
    this.checkAndAdvanceShow();
    
    let startTime = this.currentShowStartTime;
    const shows: Show[] = [];
    
    // Build shows starting from current
    for (let i = 0; i < this.queue.length; i++) {
      const index = (this.currentIndex + i) % this.queue.length;
      const item = this.queue[index];
      
      if (i === 0) {
        // Current show - use actual start time
        shows.push(this.queueItemToShow(item, this.currentShowStartTime));
        startTime = this.currentShowStartTime + item.duration * 1000;
      } else {
        shows.push(this.queueItemToShow(item, startTime));
        startTime += item.duration * 1000;
      }
    }
    
    return [{
      id: 'main',
      name: 'Main Channel',
      schedule: shows,
    }];
  }

  getChannel(channelId: string): Channel | null {
    const channels = this.getChannels();
    return channels.find(c => c.id === channelId) || null;
  }

  getAllShows(): Show[] {
    return this.getChannels().flatMap(c => c.schedule);
  }

  getCurrentShow(channelId: string = 'main'): Show | null {
    this.checkAndAdvanceShow();
    
    if (this.queue.length === 0) return null;
    
    const currentItem = this.queue[this.currentIndex];
    if (!currentItem) return null;
    
    return this.queueItemToShow(currentItem, this.currentShowStartTime);
  }

  getUpcomingShows(channelId: string = 'main', limit: number = 5): Show[] {
    this.checkAndAdvanceShow();
    
    if (this.queue.length <= 1) return [];
    
    const shows: Show[] = [];
    let startTime = this.currentShowStartTime + (this.queue[this.currentIndex]?.duration || 0) * 1000;
    
    for (let i = 1; i < this.queue.length && shows.length < limit; i++) {
      const index = (this.currentIndex + i) % this.queue.length;
      const item = this.queue[index];
      
      shows.push(this.queueItemToShow(item, startTime));
      startTime += item.duration * 1000;
    }
    
    return shows;
  }

  getShowByVideoId(videoId: string): Show | null {
    this.checkAndAdvanceShow();
    
    const currentItem = this.queue[this.currentIndex];
    if (currentItem && currentItem.videoId === videoId) {
      return this.queueItemToShow(currentItem, this.currentShowStartTime);
    }
    
    return null;
  }

  calculateCurrentTimestamp(show: Show): number {
    const now = Date.now();
    const startTime = new Date(show.startTime).getTime();
    const elapsedSeconds = Math.floor((now - startTime) / 1000);
    return Math.max(0, Math.min(elapsedSeconds, show.duration));
  }
  
  // Check if show changed and return the new show if it did
  checkForShowChange(): Show | null {
    const changed = this.checkAndAdvanceShow();
    if (changed) {
      return this.getCurrentShow();
    }
    return null;
  }
}

export const scheduleService = new ScheduleService();
