import DOMPurify from 'dompurify';
import { SYNC, TIMING } from '@shared/constants';
import type {
  ContentToBackgroundMessage,
  BackgroundToContentMessage,
} from '@shared/message-types';
import type { ChannelDoc, ChatMessage } from '@shared/types';

// ============================================
// State
// ============================================

let activeChannel: ChannelDoc | null = null;
let messages: ChatMessage[] = [];
let viewerCount = 0;
let connectionStatus: 'connected' | 'reconnecting' | 'disconnected' = 'disconnected';
let username: string | null = null;
let userId: string | null = null;
let overlayInjected = false;
let driftLoopHandle: number | null = null;
let adObserver: MutationObserver | null = null;
let inAd = false;
let durationReported = false;

// ============================================
// Bootstrap
// ============================================

function initialize(): void {
  console.log('[WatchParty Content] Initializing...');
  loadUserInfo();
  setupMessageListener();
  setupNavigationObserver();
  if (isVideoPage()) {
    setTimeout(injectWatchPartyButton, 1500);
  }
  // Tabs that load mid-broadcast missed the realtime CHANNEL_UPDATE
  // event that fired when the host started playback. Pull state from
  // the service worker so the overlay attaches immediately.
  void requestCurrentChannel();
  console.log('[WatchParty Content] Initialized');
}

async function requestCurrentChannel(): Promise<void> {
  try {
    const response = await sendMessage<{ channel: ChannelDoc | null }>({
      type: 'GET_CURRENT_CHANNEL',
    });
    if (response.channel) {
      onChannelUpdate(response.channel);
    }
  } catch (err) {
    console.warn('[WatchParty Content] GET_CURRENT_CHANNEL failed:', err);
  }
}

async function loadUserInfo(): Promise<void> {
  try {
    const response = await sendMessage<{ username: string | null; userId: string }>({
      type: 'GET_USERNAME',
    });
    username = response.username;
    userId = response.userId;
  } catch (error) {
    console.error('[WatchParty Content] Failed to load user info:', error);
  }
}

function isVideoPage(): boolean {
  return window.location.pathname === '/watch' &&
    new URLSearchParams(window.location.search).has('v');
}

function getVideoId(): string | null {
  return new URLSearchParams(window.location.search).get('v');
}

function setupNavigationObserver(): void {
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    console.log('[WatchParty Content] Navigation:', lastUrl);

    durationReported = false;
    teardownAdObserver();

    if (isVideoPage()) {
      // Reattach ad observer + duration reporter for new video
      setTimeout(setupAdObserver, 1500);
      setTimeout(reportVideoDurationOnce, 2000);
      watchPartyButtonInjected = false;
      setTimeout(injectWatchPartyButton, 1500);
    } else {
      removeWatchPartyButton();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ============================================
// Message bus
// ============================================

function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener((
    message: BackgroundToContentMessage,
    _sender,
    sendResponse
  ) => {
    handleBackgroundMessage(message);
    sendResponse({ received: true });
    return true;
  });
}

function handleBackgroundMessage(message: BackgroundToContentMessage): void {
  switch (message.type) {
    case 'CHANNEL_UPDATE':
      onChannelUpdate(message.channel);
      break;
    case 'BROADCAST_STOPPED':
      onBroadcastStopped();
      break;
    case 'NEW_MESSAGE':
      messages.push(message.message);
      if (messages.length > 200) messages = messages.slice(-200);
      updateOverlayMessages();
      break;
    case 'USER_COUNT_UPDATE':
      viewerCount = message.count;
      updateOverlayViewerCount();
      break;
    case 'CONNECTION_STATUS':
      connectionStatus = message.status;
      updateOverlayConnectionStatus();
      break;
  }
}

function sendMessage<T>(message: ContentToBackgroundMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

// ============================================
// Channel sync (viewer side)
// ============================================

function onChannelUpdate(channel: ChannelDoc): void {
  const previous = activeChannel;
  activeChannel = channel;

  if (!overlayInjected) showOverlay();
  else updateOverlay();

  // Detect video change → navigate
  const expectedVideoId = currentVideoIdFromChannel();
  const onVideoId = getVideoId();
  if (expectedVideoId && expectedVideoId !== onVideoId) {
    const t = Math.floor(channelTime());
    window.location.href = `https://www.youtube.com/watch?v=${expectedVideoId}&t=${t}`;
    return;
  }

  // Reset duration reporter if index changed
  if (previous && previous.currentVideoIndex !== channel.currentVideoIndex) {
    durationReported = false;
  }

  ensureDriftLoop();
  ensureAdObserver();
}

function onBroadcastStopped(): void {
  console.log('[WatchParty Content] Broadcast stopped by host');
  stopDriftLoop();
  teardownAdObserver();
  if (overlayInjected) {
    const banner = document.createElement('div');
    banner.textContent = 'Broadcast stopped by host';
    banner.style.cssText = 'position:fixed;top:80px;right:20px;z-index:99999;padding:12px 16px;background:#212121;color:#f1f1f1;border:1px solid #303030;border-radius:8px;font-family:Roboto,Arial,sans-serif;font-size:14px;';
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 5000);
  }
  hideOverlay();
  activeChannel = null;
  messages = [];
}

function currentVideoIdFromChannel(): string | null {
  // The playlist itself is fetched via popup / service worker; the
  // currently expected videoId is appended as a derived field on the
  // channel doc by the service worker when it pushes CHANNEL_UPDATE.
  // Until that wiring lands (M2/M3), fall back to none.
  return (activeChannel as ChannelDoc & { currentVideoId?: string })?.currentVideoId || null;
}

function channelTime(): number {
  if (!activeChannel) return 0;
  const ch = activeChannel;
  if (ch.state === 'stopped' || !ch.currentVideoStartedAt) return 0;
  const ref = ch.state === 'paused' && ch.pausedAt
    ? new Date(ch.pausedAt).getTime()
    : Date.now();
  return Math.max(0, (ref - new Date(ch.currentVideoStartedAt).getTime() - ch.pauseAccumMs) / 1000);
}

function ensureDriftLoop(): void {
  if (driftLoopHandle !== null) return;
  driftLoopHandle = window.setInterval(driftTick, TIMING.SYNC_DRIFT_LOOP_MS);
}

function stopDriftLoop(): void {
  if (driftLoopHandle !== null) {
    clearInterval(driftLoopHandle);
    driftLoopHandle = null;
  }
}

function driftTick(): void {
  if (!activeChannel || activeChannel.state !== 'playing') return;
  if (inAd) return;

  const video = document.querySelector<HTMLVideoElement>('video');
  if (!video) return;

  const target = channelTime();
  const drift = video.currentTime - target;
  const abs = Math.abs(drift);

  if (abs > SYNC.HARD_SNAP_THRESHOLD) {
    video.currentTime = target;
    video.playbackRate = 1;
  } else if (abs > SYNC.SOFT_NUDGE_THRESHOLD) {
    // Behind → speed up slightly; ahead → slow down slightly
    video.playbackRate = drift < 0 ? 1.05 : 0.95;
  } else {
    video.playbackRate = 1;
  }
}

// ============================================
// Ad detection
// ============================================

function ensureAdObserver(): void {
  if (adObserver) return;
  setupAdObserver();
}

function setupAdObserver(): void {
  const player = document.querySelector('#movie_player');
  if (!player) {
    setTimeout(setupAdObserver, 500);
    return;
  }
  adObserver = new MutationObserver(checkAdState);
  adObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
  checkAdState();
}

function teardownAdObserver(): void {
  adObserver?.disconnect();
  adObserver = null;
  inAd = false;
}

function isAdShowing(): boolean {
  const player = document.querySelector('#movie_player');
  if (!player) return false;
  if (player.classList.contains('ad-showing')) return true;
  if (player.classList.contains('ad-interrupting')) return true;
  return !!document.querySelector('.video-ads .ytp-ad-player-overlay');
}

function checkAdState(): void {
  const adNow = isAdShowing();
  if (inAd && !adNow) {
    onAdEnd();
  } else if (!inAd && adNow) {
    onAdStart();
  }
  inAd = adNow;
}

function onAdStart(): void {
  console.log('[WatchParty Content] Ad started — pausing sync');
}

function onAdEnd(): void {
  console.log('[WatchParty Content] Ad ended — snapping to channel time');
  const video = document.querySelector<HTMLVideoElement>('video');
  if (video && activeChannel?.state === 'playing') {
    video.currentTime = channelTime();
    video.playbackRate = 1;
  }
}

// ============================================
// Duration reporter (PLAN §3 decision 1: read video.duration on host)
// ============================================

async function reportVideoDurationOnce(): Promise<void> {
  if (durationReported) return;
  if (!activeChannel) return;

  const video = document.querySelector<HTMLVideoElement>('video');
  if (!video) {
    setTimeout(reportVideoDurationOnce, 1000);
    return;
  }
  if (!video.duration || !isFinite(video.duration) || isAdShowing()) {
    setTimeout(reportVideoDurationOnce, 1000);
    return;
  }

  const videoId = getVideoId();
  if (!videoId) return;

  try {
    await sendMessage({
      type: 'REPORT_VIDEO_DURATION',
      videoId,
      duration: Math.floor(video.duration),
    });
    durationReported = true;
  } catch (err) {
    console.warn('[WatchParty Content] Failed to report duration:', err);
  }
}

// ============================================
// Video ended → trigger advance
// ============================================

function setupVideoEndedListener(): void {
  const findVideo = () => document.querySelector<HTMLVideoElement>('video');
  const attachListener = () => {
    const video = findVideo();
    if (!video) {
      setTimeout(attachListener, 500);
      return;
    }
    video.addEventListener('ended', () => {
      const videoId = getVideoId();
      if (!videoId || !activeChannel) return;
      console.log('[WatchParty Content] Video ended → advancing channel');
      sendMessage({ type: 'VIDEO_ENDED', videoId });
    });
  };
  attachListener();
}

// ============================================
// Overlay rendering
// ============================================

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['div', 'span', 'p', 'button', 'input', 'h3', 'strong', 'svg', 'path'],
  ALLOWED_ATTR: ['class', 'id', 'style', 'title', 'aria-label', 'placeholder', 'maxlength', 'type', 'value', 'disabled'],
};

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

function showOverlay(): void {
  if (overlayInjected) {
    updateOverlay();
    return;
  }
  const container = document.createElement('div');
  container.id = 'watch-party-root';
  const shadowRoot = container.attachShadow({ mode: 'open' });

  const styles = document.createElement('style');
  styles.textContent = getOverlayStyles();
  shadowRoot.appendChild(styles);

  const overlay = document.createElement('div');
  overlay.className = 'watch-party-overlay';
  overlay.id = 'wp-overlay';
  shadowRoot.appendChild(overlay);

  document.body.appendChild(container);
  overlayInjected = true;

  setupVideoEndedListener();
  ensureAdObserver();
  ensureDriftLoop();

  updateOverlay();
}

function hideOverlay(): void {
  const container = document.getElementById('watch-party-root');
  if (container) {
    container.remove();
    overlayInjected = false;
  }
  stopDriftLoop();
  teardownAdObserver();
}

function updateOverlay(): void {
  const container = document.getElementById('watch-party-root');
  if (!container?.shadowRoot) return;
  const overlay = container.shadowRoot.getElementById('wp-overlay');
  if (!overlay) return;
  overlay.innerHTML = sanitize(renderOverlayHTML());
  setupOverlayListeners(container.shadowRoot);
}

function updateOverlayMessages(): void {
  const container = document.getElementById('watch-party-root');
  if (!container?.shadowRoot) return;
  const messagesContainer = container.shadowRoot.querySelector('.chat-messages');
  if (!messagesContainer) return;
  messagesContainer.innerHTML = sanitize(renderMessagesHTML());
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateOverlayViewerCount(): void {
  const container = document.getElementById('watch-party-root');
  if (!container?.shadowRoot) return;
  const el = container.shadowRoot.querySelector('.viewer-count');
  if (el) el.textContent = `${viewerCount} watching`;
}

function updateOverlayConnectionStatus(): void {
  const container = document.getElementById('watch-party-root');
  if (!container?.shadowRoot) return;
  const statusEl = container.shadowRoot.querySelector('.connection-status');
  if (statusEl) {
    statusEl.className = `connection-status ${connectionStatus}`;
    statusEl.innerHTML = sanitize(`<span class="status-dot"></span>${
      connectionStatus === 'connected' ? 'Connected' :
      connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'
    }`);
  }
}

function renderOverlayHTML(): string {
  const channelName = escapeHtml(activeChannel?.name || 'Watch Party');
  const displayUsername = escapeHtml(username || `Guest_${userId?.substring(5, 10) || 'anon'}`);
  const usernameValue = escapeHtml(username || '');

  return `
    <div class="chat-header">
      <div class="chat-header-left">
        <span class="chat-title">${channelName}</span>
        <span class="chat-viewers">
          <span class="live-dot"></span>
          <span class="viewer-count">${viewerCount} watching</span>
        </span>
      </div>
      <div class="chat-header-right">
        <button class="icon-btn collapse-btn" title="Collapse">−</button>
        <button class="icon-btn close-btn" title="Close">×</button>
      </div>
    </div>
    <div class="chat-body">
      <div class="connection-status ${connectionStatus}">
        <span class="status-dot"></span>
        ${connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
      </div>
      <div class="chat-messages">
        ${renderMessagesHTML()}
      </div>
    </div>
    <div class="chat-input-area">
      <div class="chat-user-info">
        <span class="current-user">Chatting as <strong class="username-display">${displayUsername}</strong></span>
        <button class="change-username-btn">Change</button>
      </div>
      <div class="chat-input-container">
        <input type="text" class="chat-input" placeholder="Send a message..." maxlength="300">
        <span class="char-count">0/300</span>
        <button class="send-btn" title="Send">➤</button>
      </div>
    </div>

    <div class="username-modal" style="display: none;">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Set your username</h3>
          <button class="modal-close-btn">×</button>
        </div>
        <div class="modal-body">
          <input type="text" class="username-input" placeholder="Enter username" maxlength="20" value="${usernameValue}">
          <p class="username-hint">3-20 characters, letters, numbers, and underscores only</p>
          <p class="username-error" style="display: none;"></p>
        </div>
        <div class="modal-footer">
          <button class="modal-cancel-btn">Cancel</button>
          <button class="modal-save-btn">Save</button>
        </div>
      </div>
    </div>
  `;
}

function renderMessagesHTML(): string {
  if (messages.length === 0) {
    return `<div class="chat-message system"><span class="msg-text">Welcome to the watch party!</span></div>`;
  }
  return messages.map(msg => {
    const color = getColorForUsername(msg.username);
    const isOwn = msg.userId === userId;
    const safeUsername = escapeHtml(msg.username);
    const safeAvatar = escapeHtml(msg.username.charAt(0).toUpperCase());
    return `
      <div class="chat-message ${isOwn ? 'own' : ''}">
        <span class="msg-avatar" style="background: ${color};">${safeAvatar}</span>
        <div class="msg-content">
          <div class="msg-header">
            <span class="msg-username" style="color: ${color};">${safeUsername}</span>
            <span class="msg-time">${formatRelativeTime(msg.createdAt)}</span>
          </div>
          <p class="msg-text">${escapeHtml(msg.text)}</p>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function getColorForUsername(name: string): string {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function setupOverlayListeners(shadowRoot: ShadowRoot): void {
  const overlayEl = shadowRoot.querySelector('.watch-party-overlay');
  ['keydown', 'keyup', 'keypress'].forEach(evt => {
    overlayEl?.addEventListener(evt, e => e.stopPropagation());
  });

  shadowRoot.querySelector('.close-btn')?.addEventListener('click', () => {
    sendMessage({ type: 'LEAVE_CHANNEL' });
    hideOverlay();
  });

  const collapseBtn = shadowRoot.querySelector('.collapse-btn');
  const overlay = shadowRoot.querySelector('.watch-party-overlay');
  collapseBtn?.addEventListener('click', () => {
    overlay?.classList.toggle('collapsed');
    if (collapseBtn.textContent === '−') collapseBtn.textContent = '+';
    else collapseBtn.textContent = '−';
  });

  const chatInput = shadowRoot.querySelector('.chat-input') as HTMLInputElement;
  const charCount = shadowRoot.querySelector('.char-count');
  const sendBtn = shadowRoot.querySelector('.send-btn');

  chatInput?.addEventListener('input', () => {
    if (charCount) {
      const len = chatInput.value.length;
      charCount.textContent = `${len}/300`;
      charCount.classList.toggle('warning', len > 280);
    }
  });

  chatInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
      sendChatMessage(chatInput.value.trim());
      chatInput.value = '';
      if (charCount) charCount.textContent = '0/300';
    }
  });

  sendBtn?.addEventListener('click', () => {
    if (chatInput?.value.trim()) {
      sendChatMessage(chatInput.value.trim());
      chatInput.value = '';
      if (charCount) charCount.textContent = '0/300';
    }
  });

  // Username modal
  const changeUsernameBtn = shadowRoot.querySelector('.change-username-btn');
  const usernameModal = shadowRoot.querySelector('.username-modal') as HTMLElement;
  const modalCloseBtn = shadowRoot.querySelector('.modal-close-btn');
  const modalCancelBtn = shadowRoot.querySelector('.modal-cancel-btn');
  const modalSaveBtn = shadowRoot.querySelector('.modal-save-btn');
  const usernameInput = shadowRoot.querySelector('.username-input') as HTMLInputElement;
  const usernameError = shadowRoot.querySelector('.username-error') as HTMLElement;

  changeUsernameBtn?.addEventListener('click', () => {
    if (usernameModal) usernameModal.style.display = 'flex';
    usernameInput?.focus();
  });

  const closeModal = () => {
    if (usernameModal) usernameModal.style.display = 'none';
    if (usernameError) usernameError.style.display = 'none';
  };
  modalCloseBtn?.addEventListener('click', closeModal);
  modalCancelBtn?.addEventListener('click', closeModal);

  modalSaveBtn?.addEventListener('click', async () => {
    const newUsername = usernameInput?.value.trim();
    if (!newUsername) return;
    if (newUsername.length < 3 || newUsername.length > 20) {
      if (usernameError) {
        usernameError.textContent = 'Username must be 3-20 characters';
        usernameError.style.display = 'block';
      }
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      if (usernameError) {
        usernameError.textContent = 'Only letters, numbers, and underscores allowed';
        usernameError.style.display = 'block';
      }
      return;
    }
    const response = await sendMessage<{ success: boolean; error?: string }>({
      type: 'SET_USERNAME',
      username: newUsername,
    });
    if (response.success) {
      username = newUsername;
      closeModal();
      updateOverlay();
    } else if (usernameError) {
      usernameError.textContent = response.error || 'Failed to save username';
      usernameError.style.display = 'block';
    }
  });

  const messagesContainer = shadowRoot.querySelector('.chat-messages');
  if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendChatMessage(text: string): Promise<void> {
  const response = await sendMessage<{ success: boolean; error?: string }>({
    type: 'SEND_CHAT',
    text,
  });
  if (!response.success) {
    console.error('[WatchParty Content] Failed to send message:', response.error);
  }
}

// ============================================
// YouTube "Watch Party" button injection
// ============================================

let watchPartyButtonInjected = false;

function injectWatchPartyButton(): void {
  if (watchPartyButtonInjected) return;
  if (!isVideoPage()) return;

  const actionsContainer = document.querySelector('#actions #actions-inner #menu ytd-menu-renderer #top-level-buttons-computed');
  if (!actionsContainer) {
    setTimeout(injectWatchPartyButton, 1000);
    return;
  }
  if (actionsContainer.querySelector('#watch-party-yt-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'watch-party-yt-btn';
  btn.title = 'Watch Party';
  btn.setAttribute('aria-label', 'Watch Party');
  Object.assign(btn.style, {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    height: '36px', padding: '0 16px', marginLeft: '8px',
    fontFamily: '"Roboto", "Arial", sans-serif', fontSize: '14px', fontWeight: '500',
    color: '#fff', background: 'linear-gradient(135deg, #ff4444, #ff6b6b)',
    border: 'none', borderRadius: '18px', cursor: 'pointer',
    transition: 'all 0.2s ease', verticalAlign: 'middle',
    whiteSpace: 'nowrap' as string, position: 'relative' as string, overflow: 'hidden' as string,
  });
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="flex-shrink:0">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
    </svg>
    <span>Watch Party</span>
  `;
  btn.addEventListener('mouseenter', () => {
    btn.style.boxShadow = '0 4px 12px rgba(255, 68, 68, 0.4)';
    btn.style.transform = 'translateY(-1px)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.boxShadow = 'none';
    btn.style.transform = 'translateY(0)';
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sendMessage({ type: 'GET_SESSION_STATUS' });
  });
  actionsContainer.appendChild(btn);
  watchPartyButtonInjected = true;
}

function removeWatchPartyButton(): void {
  const btn = document.getElementById('watch-party-yt-btn');
  if (btn) btn.remove();
  watchPartyButtonInjected = false;
}

// ============================================
// Styles
// ============================================

function getOverlayStyles(): string {
  return `
    :host { all: initial; font-family: 'Roboto', 'Arial', sans-serif; }
    .watch-party-overlay {
      position: fixed; top: 56px; right: 0; width: 350px; height: calc(100vh - 56px);
      background: rgba(15, 15, 15, 0.98); border-left: 1px solid #303030;
      display: flex; flex-direction: column; z-index: 9999;
      animation: slideIn 0.2s ease-out; font-size: 14px; color: #f1f1f1;
    }
    .watch-party-overlay.collapsed { width: 50px; }
    .watch-party-overlay.collapsed .chat-body,
    .watch-party-overlay.collapsed .chat-input-area,
    .watch-party-overlay.collapsed .chat-title,
    .watch-party-overlay.collapsed .chat-viewers { display: none; }
    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
    .chat-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px; border-bottom: 1px solid #303030; background: #212121; flex-shrink: 0;
    }
    .chat-header-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .chat-title { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chat-viewers { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #aaa; }
    .live-dot { width: 8px; height: 8px; background: #ff0000; border-radius: 50%; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .chat-header-right { display: flex; gap: 4px; flex-shrink: 0; }
    .icon-btn {
      width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
      background: transparent; border: none; border-radius: 50%; color: #f1f1f1;
      font-size: 18px; cursor: pointer; transition: background 0.1s;
    }
    .icon-btn:hover { background: #3f3f3f; }
    .chat-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
    .connection-status {
      display: flex; align-items: center; gap: 6px; padding: 6px 12px;
      font-size: 11px; background: #1a1a1a; color: #aaa; flex-shrink: 0;
    }
    .connection-status .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #717171; }
    .connection-status.connected .status-dot { background: #2ba640; }
    .connection-status.reconnecting .status-dot { background: #f9a825; animation: pulse 1s infinite; }
    .connection-status.disconnected .status-dot { background: #ff4e45; }
    .chat-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
    .chat-messages::-webkit-scrollbar { width: 8px; }
    .chat-messages::-webkit-scrollbar-track { background: transparent; }
    .chat-messages::-webkit-scrollbar-thumb { background: #3f3f3f; border-radius: 4px; }
    .chat-message { display: flex; gap: 8px; animation: fadeIn 0.15s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .chat-message.system { justify-content: center; }
    .chat-message.system .msg-text { color: #717171; font-size: 12px; font-style: italic; text-align: center; }
    .msg-avatar {
      width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center;
      justify-content: center; font-size: 12px; font-weight: 500; color: white; flex-shrink: 0;
    }
    .msg-content { flex: 1; min-width: 0; }
    .msg-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2px; }
    .msg-username { font-size: 13px; font-weight: 500; }
    .msg-time { font-size: 11px; color: #717171; }
    .msg-text { font-size: 14px; line-height: 1.4; word-wrap: break-word; color: #f1f1f1; }
    .chat-input-area { padding: 12px; border-top: 1px solid #303030; background: #181818; flex-shrink: 0; }
    .chat-user-info { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 12px; color: #aaa; }
    .username-display { color: #f1f1f1; }
    .change-username-btn {
      padding: 2px 8px; font-size: 11px; background: transparent;
      border: 1px solid #3f3f3f; border-radius: 4px; color: #3ea6ff; cursor: pointer;
    }
    .change-username-btn:hover { background: rgba(62, 166, 255, 0.1); }
    .chat-input-container {
      display: flex; align-items: center; gap: 8px;
      background: #272727; border-radius: 20px; padding: 4px 8px;
    }
    .chat-input {
      flex: 1; height: 32px; padding: 0 8px; font-family: inherit; font-size: 14px;
      color: #f1f1f1; background: transparent; border: none; outline: none;
    }
    .chat-input::placeholder { color: #717171; }
    .char-count { font-size: 11px; color: #717171; }
    .char-count.warning { color: #f9a825; }
    .send-btn {
      width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
      background: transparent; border: none; border-radius: 50%; color: #3ea6ff;
      font-size: 16px; cursor: pointer; transition: background 0.1s;
    }
    .send-btn:hover:not(:disabled) { background: rgba(62, 166, 255, 0.1); }
    .username-modal {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.8); display: flex; align-items: center;
      justify-content: center; z-index: 10000;
    }
    .modal-content { width: 300px; background: #212121; border-radius: 12px; overflow: hidden; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid #303030; }
    .modal-header h3 { font-size: 16px; font-weight: 500; margin: 0; }
    .modal-close-btn {
      width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
      background: transparent; border: none; border-radius: 50%; color: #aaa; font-size: 18px; cursor: pointer;
    }
    .modal-close-btn:hover { background: #3f3f3f; color: #f1f1f1; }
    .modal-body { padding: 16px; }
    .username-input {
      width: 100%; height: 40px; padding: 0 12px; font-family: inherit; font-size: 14px;
      color: #f1f1f1; background: #0f0f0f; border: 1px solid #303030; border-radius: 4px; outline: none;
    }
    .username-input:focus { border-color: #3ea6ff; }
    .username-hint { margin-top: 8px; font-size: 12px; color: #717171; }
    .username-error { margin-top: 8px; font-size: 12px; color: #ff4e45; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px; border-top: 1px solid #303030; }
    .modal-cancel-btn { padding: 8px 16px; font-family: inherit; font-size: 14px; background: transparent; border: none; border-radius: 18px; color: #3ea6ff; cursor: pointer; }
    .modal-cancel-btn:hover { background: rgba(62, 166, 255, 0.1); }
    .modal-save-btn { padding: 8px 16px; font-family: inherit; font-size: 14px; font-weight: 500; background: #f1f1f1; border: none; border-radius: 18px; color: #0f0f0f; cursor: pointer; }
    .modal-save-btn:hover { background: #d9d9d9; }
  `;
}

initialize();
