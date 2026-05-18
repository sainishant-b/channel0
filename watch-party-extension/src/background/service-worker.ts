// Polyfills the Appwrite Web SDK needs to run inside an MV3 service
// worker. The SDK's Realtime client references `window`, `localStorage`,
// and `sessionStorage`; SWs only have `self`. We map `window` to
// `globalThis` and provide in-memory `*Storage` stubs since SDK
// only uses them for non-essential caching.
const swGlobal = globalThis as Record<string, unknown>;

if (typeof swGlobal.window === 'undefined') {
  swGlobal.window = globalThis;
}

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
  };
}

if (typeof swGlobal.localStorage === 'undefined') {
  swGlobal.localStorage = createMemoryStorage();
}
if (typeof swGlobal.sessionStorage === 'undefined') {
  swGlobal.sessionStorage = createMemoryStorage();
}

import { ALARMS, TIMING } from '@shared/constants';
import {
  getUserId,
  getUsername,
  setUsername,
  getSettings,
  getActiveSession,
  saveActiveSession,
  clearActiveSession,
} from '@shared/storage';
import { appwriteClient } from '@shared/api-client';
import { realtimeClient } from './websocket-client';
import { authService } from './auth-service';
import { extractVideoId, fetchVideoTitle } from '@shared/youtube-helpers';
import type { ChatMessage, WatchPartySession, ChannelDoc, PlaylistItem } from '@shared/types';
import type {
  ContentToBackgroundMessage,
  BackgroundToContentMessage,
  HostChannelResponse,
  JoinChannelResponse,
  SessionStatusResponse,
  GetUsernameResponse,
  PlaylistResponse,
  MutationResponse,
  OwnedChannelsResponse,
  EnterChannelResponse,
} from '@shared/message-types';

// ============================================
// State
// ============================================

let cachedMessages: ChatMessage[] = [];
let activeChannel: ChannelDoc | null = null;

// ============================================
// Extension Lifecycle
// ============================================

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[WatchParty] Extension installed:', details.reason);
  const userId = await getUserId();
  console.log('[WatchParty] User ID:', userId);
  setupAlarms();
  await ensureAppwriteSession();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[WatchParty] Extension started');
  setupAlarms();
  await ensureAppwriteSession();
  // Reattach realtime subscription if a session is active
  const session = await getActiveSession();
  if (session) {
    await rejoinChannel(session.channelId);
  }
});

/**
 * Make sure an Appwrite session is alive on every service-worker boot.
 * Service workers can be killed and respawned at any time, and the
 * Appwrite SDK keeps its session in cookies that the SW process can read.
 * Calling `ensureSession` is cheap when already authenticated.
 */
async function ensureAppwriteSession(): Promise<void> {
  try {
    await authService.ensureSession();
  } catch (err) {
    console.error('[WatchParty] Failed to ensure Appwrite session:', err);
  }
}

// Fire-and-forget at top-of-file so the session is ready even when
// neither onInstalled nor onStartup fires (e.g. SW woken by a message
// after Chrome's idle eviction).
void ensureAppwriteSession();

// ============================================
// Toolbar click → open the dashboard tab
// ============================================
//
// The extension uses a full-page dashboard instead of a popup. Clicking
// the toolbar icon opens (or focuses) a single dashboard tab so we
// never leave the user with five stale copies of the UI.
const DASHBOARD_URL = chrome.runtime.getURL('src/popup/popup.html');

chrome.action.onClicked.addListener(async () => {
  try {
    const existing = await chrome.tabs.query({ url: DASHBOARD_URL });
    if (existing.length > 0 && existing[0].id !== undefined) {
      await chrome.tabs.update(existing[0].id, { active: true });
      if (existing[0].windowId !== undefined) {
        await chrome.windows.update(existing[0].windowId, { focused: true });
      }
      return;
    }
    await chrome.tabs.create({ url: DASHBOARD_URL });
  } catch (err) {
    console.error('[WatchParty] Failed to open dashboard:', err);
  }
});

// ============================================
// Alarm Management
// ============================================

function setupAlarms(): void {
  chrome.alarms.create(ALARMS.KEEP_ALIVE, {
    periodInMinutes: TIMING.KEEP_ALIVE_INTERVAL / 60000,
  });
  chrome.alarms.create(ALARMS.PRESENCE_HEARTBEAT, {
    periodInMinutes: TIMING.PRESENCE_HEARTBEAT_INTERVAL / 60000,
  });
  // Chrome's alarms API requires periodInMinutes >= 1; run the sweep
  // every minute even though the timeout window is 60 s.
  chrome.alarms.create(ALARMS.PRESENCE_SWEEP, {
    periodInMinutes: 1,
  });
  console.log('[WatchParty] Alarms set up');
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARMS.KEEP_ALIVE) {
    // No-op ping to keep service worker alive between events
    return;
  }
  if (alarm.name === ALARMS.PRESENCE_HEARTBEAT && activeChannel) {
    try {
      const userId = await authService.getAppwriteUserId();
      await appwriteClient.sendHeartbeat(activeChannel.$id, userId);
    } catch (err) {
      console.error('[WatchParty] Heartbeat failed:', err);
    }
  }
  if (alarm.name === ALARMS.PRESENCE_SWEEP && activeChannel) {
    try {
      await appwriteClient.sweepStalePresence(
        activeChannel.$id,
        TIMING.PRESENCE_TIMEOUT_MS
      );
    } catch (err) {
      console.warn('[WatchParty] Presence sweep failed:', err);
    }
  }
});

// ============================================
// Realtime Subscription
// ============================================

async function rejoinChannel(channelId: string): Promise<void> {
  const userId = await authService.getAppwriteUserId();
  const localId = await getUserId();
  const username = (await getUsername()) || `Guest_${localId.substring(5, 10)}`;

  realtimeClient.subscribe(channelId, {
    onChannelUpdate: handleChannelUpdate,
    onChatMessage: handleIncomingMessage,
    onPresenceChange: handlePresenceChange,
    onError: (err) => console.error('[WatchParty] Realtime error:', err),
    onStatusChange: handleRealtimeStatus,
  });

  await appwriteClient.sendHeartbeat(channelId, userId);
  await appwriteClient.touchPresence(channelId, userId, username);
}

async function handleChannelUpdate(channel: ChannelDoc): Promise<void> {
  activeChannel = channel;

  if (channel.state === 'stopped') {
    broadcastToYouTubeTabs({
      type: 'BROADCAST_STOPPED',
      channelId: channel.$id,
    });
    cachedMessages = [];
    return;
  }

  // Enrich the doc with the derived currentVideoId so the content
  // script can drive late-join navigation without re-fetching the
  // playlist on every update. We cache the playlist keyed by channel
  // id and refresh on index changes only.
  const enriched = { ...channel } as ChannelDoc & { currentVideoId?: string };
  try {
    const items = await appwriteClient.listPlaylist(channel.$id);
    enriched.currentVideoId = items[channel.currentVideoIndex]?.videoId;
  } catch (err) {
    console.warn('[WatchParty] Failed to enrich channel update with currentVideoId:', err);
  }

  broadcastToYouTubeTabs({
    type: 'CHANNEL_UPDATE',
    channel: enriched,
  });
}

function handleIncomingMessage(message: ChatMessage): void {
  cachedMessages.push(message);
  if (cachedMessages.length > 200) {
    cachedMessages = cachedMessages.slice(-200);
  }
  broadcastToYouTubeTabs({
    type: 'NEW_MESSAGE',
    message,
  });
}

function handleRealtimeStatus(status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'): void {
  // The content script's CONNECTION_STATUS message type only models
  // three states; fold 'connecting' into 'reconnecting' so the dot
  // animates while the first connection is being established.
  const mapped =
    status === 'connecting' ? 'reconnecting' :
    status === 'connected' ? 'connected' :
    status === 'reconnecting' ? 'reconnecting' :
    'disconnected';
  broadcastToYouTubeTabs({
    type: 'CONNECTION_STATUS',
    status: mapped,
  });
}

function handlePresenceChange(channelId: string, count: number): void {
  if (count > 0) {
    updateBadge(count.toString(), '#FF0000');
  } else {
    clearBadge();
  }
  broadcastToYouTubeTabs({
    type: 'USER_COUNT_UPDATE',
    count,
    channelId,
  });
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
    case 'GET_USERNAME':
      return handleGetUsername();

    case 'SET_USERNAME':
      return handleSetUsername(message.username);

    case 'GET_SETTINGS':
      return handleGetSettings();

    case 'SEND_CHAT':
      return handleSendChat(message.text);

    case 'GOOGLE_SIGN_IN':
      return handleGoogleSignIn();

    case 'GOOGLE_SIGN_OUT':
      return handleGoogleSignOut();

    case 'GET_GOOGLE_USER':
      return handleGetGoogleUser();

    case 'HOST_CHANNEL':
      return handleHostChannel(message.channelName, message.visibility, message.videoUrl);

    case 'JOIN_CHANNEL':
      return handleJoinChannel(message.channelCode);

    case 'LEAVE_CHANNEL':
      return handleLeaveChannel();

    case 'GET_SESSION_STATUS':
      return handleGetSessionStatus();

    case 'VIDEO_ENDED':
      return handleVideoEnded(message.videoId);

    case 'REPORT_VIDEO_DURATION':
      return handleReportVideoDuration(message.videoId, message.duration);

    case 'LIST_PLAYLIST':
      return handleListPlaylist(message.channelId);
    case 'ADD_VIDEO':
      return handleAddVideo(message.channelId, message.videoUrl);
    case 'REMOVE_VIDEO':
      return handleRemoveVideo(message.itemId);
    case 'REORDER_VIDEO':
      return handleReorderVideo(message.itemId, message.position);

    case 'START_BROADCAST':
      return handleStartBroadcast(message.channelId);
    case 'PAUSE_BROADCAST':
      return handlePauseBroadcast(message.channelId);
    case 'RESUME_BROADCAST':
      return handleResumeBroadcast(message.channelId);
    case 'SKIP_VIDEO':
      return handleSkipVideo(message.channelId);
    case 'STOP_BROADCAST':
      return handleStopBroadcast(message.channelId);

    case 'LIST_OWNED_CHANNELS':
      return handleListOwnedChannels();
    case 'DELETE_CHANNEL':
      return handleDeleteChannel(message.channelId);
    case 'ENTER_CHANNEL':
      return handleEnterChannel(message.channelId);
    case 'GET_CURRENT_CHANNEL':
      return handleGetCurrentChannel();

    default:
      console.warn('[WatchParty] Unknown message type:', message);
      return { error: 'Unknown message type' };
  }
}

// ============================================
// Message Handlers
// ============================================

async function handleGetUsername(): Promise<GetUsernameResponse> {
  const username = await getUsername();
  const userId = await getUserId();
  return { username, userId };
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

async function handleSendChat(text: string): Promise<{ success: boolean; error?: string }> {
  if (!activeChannel) {
    return { success: false, error: 'Not in a channel' };
  }
  try {
    const userId = await authService.getAppwriteUserId();
    const localId = await getUserId();
    const username = (await getUsername()) || `Guest_${localId.substring(5, 10)}`;
    await appwriteClient.sendChatMessage(activeChannel.$id, userId, username, text);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleGoogleSignIn(): Promise<{ success: boolean; user?: unknown; error?: string }> {
  try {
    const user = await authService.signInWithGoogle();
    if (user.name) {
      await setUsername(user.name.split(' ')[0] || user.name);
    }
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

async function handleHostChannel(
  channelName: string,
  visibility: 'public' | 'private',
  videoUrl?: string
): Promise<HostChannelResponse> {
  console.log('[WatchParty] Hosting channel:', channelName);

  try {
    // Use the Appwrite account id for the host identity. Appwrite
    // permission roles only accept canonical account ids, and listing
    // owned channels needs to match what was stored at create time.
    const userId = await authService.getAppwriteUserId();
    const localId = await getUserId();
    const username = (await getUsername()) || `Guest_${localId.substring(5, 10)}`;

    let initialVideoId: string | null = null;
    if (videoUrl) {
      initialVideoId = extractVideoId(videoUrl);
      if (!initialVideoId) {
        return { success: false, error: 'Invalid YouTube URL' };
      }
    }

    const channel = await appwriteClient.createChannel({
      name: channelName,
      visibility,
      hostUserId: userId,
      hostUsername: username,
      initialVideoId,
    });

    activeChannel = channel;

    const session: WatchPartySession = {
      channelId: channel.$id,
      channelCode: channel.code,
      channelName: channel.name,
      hostUserId: channel.hostUserId,
      hostUsername: channel.hostUsername,
      videoId: initialVideoId,
      videoTitle: null,
      viewerCount: 1,
      isHost: true,
      createdAt: channel.createdAt,
    };
    await saveActiveSession(session);

    await rejoinChannel(channel.$id);
    return { success: true, session };
  } catch (error) {
    console.error('[WatchParty] Failed to host channel:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function handleJoinChannel(channelCode: string): Promise<JoinChannelResponse> {
  console.log('[WatchParty] Joining channel:', channelCode);

  try {
    const channel = await appwriteClient.resolveChannelByCode(channelCode);
    activeChannel = channel;

    const session: WatchPartySession = {
      channelId: channel.$id,
      channelCode: channel.code,
      channelName: channel.name,
      hostUserId: channel.hostUserId,
      hostUsername: channel.hostUsername,
      videoId: null,
      videoTitle: null,
      viewerCount: channel.viewerCount,
      isHost: false,
      createdAt: channel.createdAt,
    };
    await saveActiveSession(session);

    await rejoinChannel(channel.$id);
    return { success: true, session };
  } catch (error) {
    console.error('[WatchParty] Failed to join channel:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function handleLeaveChannel(): Promise<{ success: boolean }> {
  console.log('[WatchParty] Leaving channel');

  if (activeChannel) {
    const userId = await authService.getAppwriteUserId();
    try {
      await appwriteClient.removePresence(activeChannel.$id, userId);
    } catch (err) {
      console.warn('[WatchParty] Failed to remove presence:', err);
    }
    realtimeClient.unsubscribe();
    activeChannel = null;
  }

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

async function handleVideoEnded(videoId: string): Promise<{ success: boolean }> {
  if (!activeChannel) return { success: true };

  // Optimistic advance: only the first client to fire wins; server-side
  // update is conditional on the index/videoId matching the current state.
  try {
    await appwriteClient.advanceChannel(activeChannel.$id, videoId);
  } catch (err) {
    console.warn('[WatchParty] Advance skipped (likely already advanced):', err);
  }
  return { success: true };
}

async function handleReportVideoDuration(videoId: string, duration: number): Promise<{ success: boolean }> {
  if (!activeChannel) return { success: true };
  try {
    await appwriteClient.setVideoDuration(activeChannel.$id, videoId, duration);
  } catch (err) {
    console.warn('[WatchParty] Failed to record duration:', err);
  }
  return { success: true };
}

// ============================================
// Playlist handlers
// ============================================

async function handleListPlaylist(channelId: string): Promise<PlaylistResponse> {
  try {
    const items = await appwriteClient.listPlaylist(channelId);
    return { success: true, items };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleAddVideo(channelId: string, videoUrl: string): Promise<MutationResponse & { item?: PlaylistItem }> {
  try {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) return { success: false, error: 'Invalid YouTube URL' };
    const title = await fetchVideoTitle(videoId);
    const item = await appwriteClient.addPlaylistItem(channelId, videoId, title);
    return { success: true, item };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleRemoveVideo(itemId: string): Promise<MutationResponse> {
  try {
    await appwriteClient.removePlaylistItem(itemId);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleReorderVideo(itemId: string, position: number): Promise<MutationResponse> {
  try {
    await appwriteClient.reorderPlaylistItem(itemId, position);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================
// Host lifecycle handlers
// ============================================

async function handleStartBroadcast(channelId: string): Promise<MutationResponse> {
  try {
    await appwriteClient.startBroadcast(channelId);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handlePauseBroadcast(channelId: string): Promise<MutationResponse> {
  try {
    await appwriteClient.pauseBroadcast(channelId);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleResumeBroadcast(channelId: string): Promise<MutationResponse> {
  try {
    await appwriteClient.resumeBroadcast(channelId);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleSkipVideo(channelId: string): Promise<MutationResponse> {
  try {
    const ch = await appwriteClient.getChannel(channelId);
    const items = await appwriteClient.listPlaylist(channelId);
    const current = items[ch.currentVideoIndex];
    if (!current) return { success: false, error: 'No current video to skip' };
    await appwriteClient.advanceChannel(channelId, current.videoId);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleStopBroadcast(channelId: string): Promise<MutationResponse> {
  try {
    // Post a system chat message before stopping so viewers see context.
    try {
      await appwriteClient.sendChatMessage(channelId, 'system', 'System', 'Broadcast stopped by host');
    } catch (chatErr) {
      console.warn('[WatchParty] Failed to post stop chat message:', chatErr);
    }
    await appwriteClient.stopBroadcast(channelId);
    // Ephemeral chat per PLAN.md §2 — wipe right after the stop event
    // is observed by viewers. This replaces the deferred cleanup
    // Appwrite Function (T15) for v1 ship; if abuse becomes a concern
    // (clients delete each other's history), revisit by moving the
    // wipe server-side with a function that gates on host identity.
    try {
      await appwriteClient.wipeChat(channelId);
    } catch (wipeErr) {
      console.warn('[WatchParty] Chat wipe failed:', wipeErr);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================
// Owned channels handlers
// ============================================

async function handleListOwnedChannels(): Promise<OwnedChannelsResponse> {
  try {
    const userId = await authService.getAppwriteUserId();
    const channels = await appwriteClient.listOwnedChannels(userId);
    return { success: true, channels };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Returns the currently active channel doc (enriched with currentVideoId)
 * for use by content scripts loading mid-broadcast. New YouTube tabs
 * miss the realtime CHANNEL_UPDATE event that fired when broadcast
 * started, so they pull state on demand instead.
 *
 * Service workers in MV3 die between events. The module-level
 * `activeChannel` does not survive eviction, so we rehydrate it from
 * `chrome.storage.local` (where the popup persisted the session) and
 * re-attach the realtime subscription before responding.
 */
async function handleGetCurrentChannel(): Promise<{ channel: (ChannelDoc & { currentVideoId?: string }) | null }> {
  if (!activeChannel) {
    const session = await getActiveSession();
    if (!session) return { channel: null };
    try {
      activeChannel = await appwriteClient.getChannel(session.channelId);
      await rejoinChannel(session.channelId);
    } catch (err) {
      console.warn('[WatchParty] Rehydrate channel failed:', err);
      return { channel: null };
    }
  }
  const enriched = { ...activeChannel } as ChannelDoc & { currentVideoId?: string };
  try {
    const items = await appwriteClient.listPlaylist(activeChannel.$id);
    enriched.currentVideoId = items[activeChannel.currentVideoIndex]?.videoId;
  } catch (err) {
    console.warn('[WatchParty] currentVideoId enrich failed:', err);
  }
  return { channel: enriched };
}

async function handleEnterChannel(channelId: string): Promise<EnterChannelResponse> {
  try {
    const channel = await appwriteClient.getChannel(channelId);
    activeChannel = channel;

    const userId = await authService.getAppwriteUserId();
    const isHost = channel.hostUserId === userId;

    // Derive current videoId from playlist for the session card.
    let videoId: string | null = null;
    let videoTitle: string | null = null;
    try {
      const items = await appwriteClient.listPlaylist(channelId);
      const current = items[channel.currentVideoIndex];
      if (current) {
        videoId = current.videoId;
        videoTitle = current.videoTitle;
      }
    } catch {
      // Playlist read is non-fatal for entering the channel.
    }

    const session: WatchPartySession = {
      channelId: channel.$id,
      channelCode: channel.code,
      channelName: channel.name,
      hostUserId: channel.hostUserId,
      hostUsername: channel.hostUsername,
      videoId,
      videoTitle,
      viewerCount: channel.viewerCount,
      isHost,
      createdAt: channel.createdAt,
    };
    await saveActiveSession(session);
    await rejoinChannel(channelId);
    return { success: true, session };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function handleDeleteChannel(channelId: string): Promise<MutationResponse> {
  try {
    // Best-effort cascade: stop broadcast, then delete the channel doc
    // (deleteChannel cascades playlist / chat / presence rows). When the
    // channel-cleanup-on-stop Function ships (M7) the cascade should
    // move server-side.
    await appwriteClient.stopBroadcast(channelId).catch(() => undefined);
    await appwriteClient.deleteChannel(channelId);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================
// Helpers
// ============================================

function updateBadge(text: string, color: string): void {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

function clearBadge(): void {
  chrome.action.setBadgeText({ text: '' });
}

async function broadcastToYouTubeTabs(message: BackgroundToContentMessage): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });

  for (const tab of tabs) {
    if (tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        // Tab may not have content script loaded
      }
    }
  }
}

console.log('[WatchParty] Service worker loaded');
