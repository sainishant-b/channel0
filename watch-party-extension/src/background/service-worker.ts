import { ALARMS, TIMING } from '@shared/constants';
import { getUserId, getUsername, setUsername, getSettings, getActiveSession, saveActiveSession, clearActiveSession } from '@shared/storage';
import { apiClient } from '@shared/api-client';
import { wsClient } from './websocket-client';
import { notificationManager } from './notification-manager';
import { authService } from './auth-service';
import type { ChatMessage, Show } from '@shared/types';
import type { 
  ContentToBackgroundMessage, 
  CheckScheduledResponse, 
  GetScheduleResponse, 
  GetUsernameResponse,
  BackgroundToContentMessage,
  HostChannelResponse,
  JoinChannelResponse,
  SessionStatusResponse 
} from '@shared/message-types';
import type { WatchPartySession } from '@shared/types';

// ============================================
// State
// ============================================

let cachedMessages: ChatMessage[] = [];
let currentLiveShow: Show | null = null;

// ============================================
// Extension Lifecycle
// ============================================

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[WatchParty] Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    const odId = await getUserId();
    console.log('[WatchParty] Generated user ID:', odId);
  }
  
  setupAlarms();
  initializeWebSocket();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[WatchParty] Extension started');
  setupAlarms();
  initializeWebSocket();
});

// ============================================
// WebSocket Initialization
// ============================================

function initializeWebSocket(): void {
  console.log('[WatchParty] Initializing WebSocket...');
  
  wsClient.connect({
    onMessage: handleIncomingMessage,
    onUserCount: handleUserCount,
    onSync: handleSync,
    onConnectionChange: handleConnectionChange,
    onHistory: handleHistory,
    onError: handleWSError,
    onVideoChange: handleVideoChange,
  });
}

function handleIncomingMessage(message: ChatMessage): void {
  console.log('[WatchParty] New message from:', message.username);
  cachedMessages.push(message);
  
  // Keep only last 200 messages
  if (cachedMessages.length > 200) {
    cachedMessages = cachedMessages.slice(-200);
  }
  
  // Broadcast to content scripts
  broadcastToYouTubeTabs({
    type: 'NEW_MESSAGE',
    message,
  });
}

function handleUserCount(showId: string, count: number): void {
  
  // Update badge
  if (count > 0) {
    updateBadge(count.toString(), '#FF0000');
  } else {
    clearBadge();
  }
  
  // Broadcast to content scripts
  broadcastToYouTubeTabs({
    type: 'USER_COUNT_UPDATE',
    count,
    showId,
  });
}

function handleSync(showId: string, timestamp: number): void {
  broadcastToYouTubeTabs({
    type: 'SYNC_UPDATE',
    timestamp,
    showId,
  });
}

function handleConnectionChange(status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected'): void {
  console.log('[WatchParty] Connection status:', status);
  
  broadcastToYouTubeTabs({
    type: 'CONNECTION_STATUS',
    status: status === 'connecting' ? 'reconnecting' : status,
  });
}

function handleHistory(messages: ChatMessage[]): void {
  console.log('[WatchParty] Received history:', messages.length, 'messages');
  cachedMessages = messages;
}

function handleWSError(error: string): void {
  console.error('[WatchParty] WebSocket error:', error);
}

function handleVideoChange(videoId: string, timestamp: number): void {
  console.log('[WatchParty] Video changed to:', videoId, 'at timestamp:', timestamp);
  
  // Only navigate tabs that are currently watching a scheduled video
  // (i.e., tabs where the content script has the overlay active)
  broadcastToYouTubeTabs({
    type: 'NAVIGATE_TO_VIDEO',
    videoId,
    timestamp,
  });
}

// ============================================
// Alarm Management
// ============================================

function setupAlarms(): void {
  chrome.alarms.create(ALARMS.KEEP_ALIVE, {
    periodInMinutes: TIMING.KEEP_ALIVE_INTERVAL / 60000,
  });
  
  // Check schedule every minute for badge updates
  chrome.alarms.create('schedule_check', {
    periodInMinutes: 1,
  });
  
  console.log('[WatchParty] Alarms set up');
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARMS.KEEP_ALIVE) {
    console.log('[WatchParty] Keep-alive ping');
    
    // Reconnect WebSocket if disconnected
    if (!wsClient.isConnected) {
      console.log('[WatchParty] Reconnecting WebSocket...');
      initializeWebSocket();
    }
  }
  
  if (alarm.name === 'schedule_check') {
    await checkScheduleAndUpdateBadge();
  }
  
  if (alarm.name.startsWith(ALARMS.SHOW_REMINDER)) {
    const showId = alarm.name.replace(ALARMS.SHOW_REMINDER, '');
    await handleShowReminder(showId);
  }
});

async function checkScheduleAndUpdateBadge(): Promise<void> {
  try {
    const response = await apiClient.getSchedule();
    
    // Check if a new show just started
    if (response.currentShow && (!currentLiveShow || currentLiveShow.id !== response.currentShow.id)) {
      // New show started - send notification
      await notificationManager.showStartingNotification(response.currentShow);
      await notificationManager.storeShowInfo(response.currentShow);
    }
    
    currentLiveShow = response.currentShow;
    
    // Update badge
    if (response.currentShow) {
      // Show is live - red badge with "LIVE"
      updateBadge('LIVE', '#FF0000');
    } else if (response.upcomingShows.length > 0) {
      // Show coming up - check if within 30 minutes
      const nextShow = response.upcomingShows[0];
      const startTime = new Date(nextShow.startTime).getTime();
      const minutesUntil = Math.floor((startTime - Date.now()) / 60000);
      
      if (minutesUntil <= 30 && minutesUntil > 0) {
        updateBadge(`${minutesUntil}m`, '#3EA6FF');
      } else {
        clearBadge();
      }
    } else {
      clearBadge();
    }
  } catch (error) {
    console.error('[WatchParty] Failed to check schedule:', error);
  }
}

async function handleShowReminder(showId: string): Promise<void> {
  console.log('[WatchParty] Show reminder:', showId);
  
  // Get reminder info
  const result = await chrome.storage.local.get(`reminder_${showId}`);
  const reminderInfo = result[`reminder_${showId}`];
  
  if (!reminderInfo) {
    console.log('[WatchParty] No reminder info found for:', showId);
    return;
  }
  
  // Show notification
  await chrome.notifications.create(`reminder_${showId}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('public/icons/icon128.png'),
    title: 'Watch Party Starting Soon!',
    message: `"${reminderInfo.showTitle}" starts in 5 minutes`,
    priority: 2,
  });
  
  // Clean up reminder storage
  await chrome.storage.local.remove(`reminder_${showId}`);
}

// ============================================
// Message Handling
// ============================================

chrome.runtime.onMessage.addListener((
  message: ContentToBackgroundMessage,
  _sender,
  sendResponse
) => {
  console.log('[WatchParty] Received message:', message.type);
  
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => {
      console.error('[WatchParty] Message handling error:', error);
      sendResponse({ error: error.message });
    });
  
  return true;
});

async function handleMessage(message: ContentToBackgroundMessage): Promise<unknown> {
  switch (message.type) {
    case 'CHECK_SCHEDULED':
      return handleCheckScheduled(message.videoId);
    
    case 'GET_SCHEDULE':
      return handleGetSchedule();
    
    case 'GET_CURRENT_SHOW':
      return handleGetCurrentShow();
    
    case 'GET_NEXT_VIDEO':
      return handleGetNextVideo();
    
    case 'GET_USERNAME':
      return handleGetUsername();
    
    case 'SET_USERNAME':
      return handleSetUsername(message.username);
    
    case 'GET_SETTINGS':
      return handleGetSettings();
    
    case 'JOIN_CHAT':
      return handleJoinChat(message.showId);
    
    case 'LEAVE_CHAT':
      return handleLeaveChat(message.showId);
    
    case 'SEND_MESSAGE':
      return handleSendMessage(message.message, message.showId);
    
    case 'SET_REMINDER':
      return handleSetReminder(message.showId, message.showTitle, message.startTime);
    
    case 'GOOGLE_SIGN_IN':
      return handleGoogleSignIn();
    
    case 'GOOGLE_SIGN_OUT':
      return handleGoogleSignOut();
    
    case 'GET_GOOGLE_USER':
      return handleGetGoogleUser();
    
    case 'VIDEO_ENDED':
      return handleVideoEnded(message.videoId, message.showId);
    
    case 'HOST_CHANNEL':
      return handleHostChannel(message.channelName, message.videoUrl);
    
    case 'JOIN_CHANNEL':
      return handleJoinChannel(message.channelCode);
    
    case 'LEAVE_CHANNEL':
      return handleLeaveChannel();
    
    case 'GET_SESSION_STATUS':
      return handleGetSessionStatus();
    
    default:
      console.warn('[WatchParty] Unknown message type:', message);
      return { error: 'Unknown message type' };
  }
}

// ============================================
// Message Handlers
// ============================================

async function handleCheckScheduled(videoId: string): Promise<CheckScheduledResponse> {
  console.log('[WatchParty] Checking if video is scheduled:', videoId);
  
  try {
    const response = await apiClient.checkVideo(videoId);
    return {
      isScheduled: response.isScheduled,
      show: response.show,
      currentTimestamp: response.timestamp,
    };
  } catch (error) {
    console.error('[WatchParty] API error checking video:', error);
    return {
      isScheduled: false,
      show: null,
      currentTimestamp: 0,
    };
  }
}

async function handleGetSchedule(): Promise<GetScheduleResponse> {
  console.log('[WatchParty] Getting schedule');
  
  try {
    const response = await apiClient.getSchedule();
    return {
      currentShow: response.currentShow,
      upcomingShows: response.upcomingShows,
      viewerCount: response.viewerCount,
    };
  } catch (error) {
    console.error('[WatchParty] API error getting schedule:', error);
    return {
      currentShow: null,
      upcomingShows: [],
      viewerCount: 0,
    };
  }
}

async function handleGetCurrentShow(): Promise<{ show: unknown; timestamp: number; viewerCount: number }> {
  console.log('[WatchParty] Getting current show');
  
  try {
    const response = await apiClient.getCurrentShow();
    return {
      show: response.show,
      timestamp: response.timestamp,
      viewerCount: response.viewerCount,
    };
  } catch (error) {
    console.error('[WatchParty] API error getting current show:', error);
    return {
      show: null,
      timestamp: 0,
      viewerCount: 0,
    };
  }
}

async function handleGetNextVideo(): Promise<{ nextVideoId: string | null }> {
  console.log('[WatchParty] Getting next video');
  
  try {
    const response = await apiClient.getSchedule();
    
    // Get the next video from upcoming shows
    if (response.upcomingShows && response.upcomingShows.length > 0) {
      const nextShow = response.upcomingShows[0];
      console.log('[WatchParty] Next video:', nextShow.videoId);
      return { nextVideoId: nextShow.videoId };
    }
    
    console.log('[WatchParty] No next video in queue');
    return { nextVideoId: null };
  } catch (error) {
    console.error('[WatchParty] API error getting next video:', error);
    return { nextVideoId: null };
  }
}

async function handleGetUsername(): Promise<GetUsernameResponse> {
  const odname = await getUsername();
  const odId = await getUserId();
  
  return { username: odname, userId: odId };
}

async function handleSetUsername(username: string): Promise<{ success: boolean; error?: string }> {
  try {
    await setUsername(username);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGetSettings(): Promise<{ settings: Awaited<ReturnType<typeof getSettings>> }> {
  const settings = await getSettings();
  return { settings };
}

async function handleJoinChat(showId: string): Promise<{ success: boolean; messages: ChatMessage[] }> {
  console.log('[WatchParty] Joining chat:', showId);
  
  const odId = await getUserId();
  let odname = await getUsername();
  
  // Generate default username if not set
  if (!odname) {
    odname = `User_${odId.substring(5, 10)}`;
  }
  
  // Ensure WebSocket is connected
  if (!wsClient.isConnected) {
    initializeWebSocket();
    // Wait a bit for connection
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  wsClient.joinRoom(showId, odId, odname);
  
  return { success: true, messages: cachedMessages };
}

async function handleLeaveChat(showId: string): Promise<{ success: boolean }> {
  console.log('[WatchParty] Leaving chat:', showId);
  
  wsClient.leaveRoom();
  cachedMessages = [];
  
  return { success: true };
}

async function handleSendMessage(message: string, _showId: string): Promise<{ success: boolean; error?: string }> {
  console.log('[WatchParty] Sending message:', message.substring(0, 50));
  
  if (!wsClient.isConnected) {
    return { success: false, error: 'Not connected to chat server' };
  }
  
  const sent = wsClient.sendMessage(message);
  
  if (!sent) {
    return { success: false, error: 'Failed to send message' };
  }
  
  return { success: true };
}

async function handleSetReminder(showId: string, showTitle: string, startTime: string): Promise<{ success: boolean }> {
  console.log('[WatchParty] Setting reminder for:', showId);
  
  const startMs = new Date(startTime).getTime();
  const reminderTime = startMs - (5 * 60 * 1000); // 5 minutes before
  
  // Create alarm
  const alarmName = `${ALARMS.SHOW_REMINDER}${showId}`;
  
  await chrome.alarms.create(alarmName, {
    when: reminderTime,
  });
  
  // Store reminder info
  await chrome.storage.local.set({
    [`reminder_${showId}`]: {
      showId,
      showTitle,
      startTime,
    },
  });
  
  console.log('[WatchParty] Reminder set for:', new Date(reminderTime).toISOString());
  
  return { success: true };
}

// ============================================
// Google Auth Handlers
// ============================================

async function handleGoogleSignIn(): Promise<{ success: boolean; user?: unknown; error?: string }> {
  try {
    const user = await authService.signIn();
    
    // Update username to Google name
    await setUsername(user.name.split(' ')[0] || user.name);
    
    return { success: true, user };
  } catch (error) {
    console.error('[WatchParty] Google sign in failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function handleGoogleSignOut(): Promise<{ success: boolean }> {
  try {
    await authService.signOut();
    return { success: true };
  } catch (error) {
    console.error('[WatchParty] Google sign out failed:', error);
    return { success: false };
  }
}

async function handleGetGoogleUser(): Promise<{ user: unknown | null }> {
  const user = await authService.getCurrentUser();
  return { user };
}

async function handleVideoEnded(videoId: string, showId: string): Promise<{ success: boolean }> {
  console.log('[WatchParty] Video ended:', videoId);
  
  // Tell server that video ended so it can advance the queue
  if (wsClient.isConnected) {
    wsClient.sendVideoEnded(showId);
  }
  
  return { success: true };
}

// ============================================
// Channel Hosting & Joining Handlers
// ============================================

function generateChannelCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v');
    }
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1);
    }
  } catch {
    // Not a valid URL
  }
  return null;
}

async function handleHostChannel(channelName: string, videoUrl?: string): Promise<HostChannelResponse> {
  console.log('[WatchParty] Hosting channel:', channelName);
  
  try {
    const userId = await getUserId();
    const username = await getUsername() || `User_${userId.substring(5, 10)}`;
    const channelCode = generateChannelCode();
    const channelId = `ch_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
    
    let videoId: string | null = null;
    let videoTitle: string | null = null;
    
    if (videoUrl) {
      videoId = extractVideoId(videoUrl);
      if (videoId) {
        videoTitle = 'YouTube Video'; // Could fetch title from API later
      }
    }
    
    const session: WatchPartySession = {
      channelId,
      channelCode,
      channelName,
      hostUserId: userId,
      hostUsername: username,
      videoId,
      videoTitle,
      viewerCount: 1,
      isHost: true,
      createdAt: new Date().toISOString(),
    };
    
    await saveActiveSession(session);
    
    // Join WebSocket room with channel ID
    if (!wsClient.isConnected) {
      initializeWebSocket();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    wsClient.joinRoom(channelId, userId, username);
    
    return { success: true, session };
  } catch (error) {
    console.error('[WatchParty] Failed to host channel:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function handleJoinChannel(channelCode: string): Promise<JoinChannelResponse> {
  console.log('[WatchParty] Joining channel with code:', channelCode);
  
  try {
    const userId = await getUserId();
    const username = await getUsername() || `User_${userId.substring(5, 10)}`;
    
    // For now, create a local session with the channel code
    // In production, this would validate the code against the server
    const channelId = `ch_${channelCode.toLowerCase()}`;
    
    const session: WatchPartySession = {
      channelId,
      channelCode,
      channelName: `Party ${channelCode}`,
      hostUserId: '',
      hostUsername: '',
      videoId: null,
      videoTitle: null,
      viewerCount: 1,
      isHost: false,
      createdAt: new Date().toISOString(),
    };
    
    await saveActiveSession(session);
    
    // Join WebSocket room
    if (!wsClient.isConnected) {
      initializeWebSocket();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    wsClient.joinRoom(channelId, userId, username);
    
    return { success: true, session };
  } catch (error) {
    console.error('[WatchParty] Failed to join channel:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function handleLeaveChannel(): Promise<{ success: boolean }> {
  console.log('[WatchParty] Leaving channel');
  
  wsClient.leaveRoom();
  cachedMessages = [];
  await clearActiveSession();
  clearBadge();
  
  return { success: true };
}

async function handleGetSessionStatus(): Promise<SessionStatusResponse> {
  const session = await getActiveSession();
  return {
    active: session !== null,
    session,
  };
}

// ============================================
// Badge Management
// ============================================

function updateBadge(text: string, color: string): void {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

function clearBadge(): void {
  chrome.action.setBadgeText({ text: '' });
}

// ============================================
// Tab Communication
// ============================================

async function broadcastToYouTubeTabs(message: BackgroundToContentMessage): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
  
  for (const tab of tabs) {
    if (tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        // Tab might not have content script loaded
      }
    }
  }
}

// ============================================
// Initialize on load
// ============================================

console.log('[WatchParty] Service worker loaded');
initializeWebSocket();

// Initial schedule check
checkScheduleAndUpdateBadge();

// ============================================
// Notification Click Handler
// ============================================

chrome.notifications.onClicked.addListener(async (notificationId) => {
  console.log('[WatchParty] Notification clicked:', notificationId);
  await notificationManager.handleNotificationClick(notificationId);
});
