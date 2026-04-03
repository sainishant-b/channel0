import type { Show } from './types';
import type { SyncStatus } from './types';
import { SYNC } from './constants';

// ============================================
// Timestamp Calculations
// ============================================

/**
 * Calculate the expected timestamp for a show based on current time
 */
export function calculateExpectedTimestamp(show: Show): number {
  const now = Date.now();
  const startTime = new Date(show.startTime).getTime();
  const elapsedSeconds = Math.floor((now - startTime) / 1000);
  
  // Clamp to show duration
  return Math.max(0, Math.min(elapsedSeconds, show.duration));
}

/**
 * Check if a show is currently live
 */
export function isShowLive(show: Show): boolean {
  const now = Date.now();
  const startTime = new Date(show.startTime).getTime();
  const endTime = new Date(show.endTime).getTime();
  
  return now >= startTime && now <= endTime;
}

/**
 * Check if a show is upcoming (starts within the next 24 hours)
 */
export function isShowUpcoming(show: Show): boolean {
  const now = Date.now();
  const startTime = new Date(show.startTime).getTime();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  
  return startTime > now && startTime <= now + twentyFourHours;
}

/**
 * Get sync status based on expected vs actual timestamp
 */
export function getSyncStatus(expected: number, actual: number): SyncStatus {
  const drift = Math.abs(expected - actual);
  
  if (drift <= SYNC.SYNCED_THRESHOLD) {
    return 'synced';
  }
  
  if (drift <= SYNC.SLIGHTLY_BEHIND_THRESHOLD) {
    return 'slightly-behind';
  }
  
  return 'out-of-sync';
}

// ============================================
// Time Formatting
// ============================================

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format time remaining (e.g., "23:45 remaining")
 */
export function formatTimeRemaining(show: Show): string {
  const now = Date.now();
  const endTime = new Date(show.endTime).getTime();
  const remainingMs = endTime - now;
  
  if (remainingMs <= 0) {
    return 'Ended';
  }
  
  const remainingSeconds = Math.floor(remainingMs / 1000);
  return `${formatDuration(remainingSeconds)} remaining`;
}

/**
 * Format relative time (e.g., "2m ago", "in 15 min")
 */
export function formatRelativeTime(timestamp: string | number): string {
  const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  const now = Date.now();
  const diff = now - time;
  const absDiff = Math.abs(diff);
  
  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  const isFuture = diff < 0;
  const prefix = isFuture ? 'in ' : '';
  const suffix = isFuture ? '' : ' ago';
  
  if (seconds < 10) {
    return 'Just now';
  }
  
  if (seconds < 60) {
    return `${prefix}${seconds}s${suffix}`;
  }
  
  if (minutes < 60) {
    return `${prefix}${minutes}m${suffix}`;
  }
  
  if (hours < 24) {
    return `${prefix}${hours}h${suffix}`;
  }
  
  return `${prefix}${days}d${suffix}`;
}

/**
 * Format countdown (e.g., "in 2h 15m")
 */
export function formatCountdown(targetTime: string): string {
  const target = new Date(targetTime).getTime();
  const now = Date.now();
  const diff = target - now;
  
  if (diff <= 0) {
    return 'Starting now';
  }
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours > 0) {
    return `in ${hours}h ${remainingMinutes}m`;
  }
  
  if (minutes > 0) {
    return `in ${minutes}m`;
  }
  
  const seconds = Math.floor(diff / 1000);
  return `in ${seconds}s`;
}

/**
 * Format time for display (e.g., "8:00 PM")
 */
export function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get progress percentage for a show
 */
export function getShowProgress(show: Show): number {
  const elapsed = calculateExpectedTimestamp(show);
  return Math.min(100, (elapsed / show.duration) * 100);
}
