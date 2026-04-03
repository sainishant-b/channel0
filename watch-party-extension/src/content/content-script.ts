import type { 
  ContentToBackgroundMessage, 
  CheckScheduledResponse, 
  BackgroundToContentMessage 
} from '@shared/message-types';
import type { Show, ChatMessage } from '@shared/types';

// ============================================
// State
// ============================================

let currentVideoId: string | null = null;
let overlayInjected = false;
let currentShow: Show | null = null;
let messages: ChatMessage[] = [];
let viewerCount = 0;
let connectionStatus: 'connected' | 'reconnecting' | 'disconnected' = 'disconnected';
let username: string | null = null;
let userId: string | null = null;
let syncTimestamp = 0;
let nextVideoId: string | null = null; // Preloaded next video

// ============================================
// Initialization
// ============================================

function initialize(): void {
  console.log('[WatchParty Content] Initializing...');
  
  // Load username
  loadUserInfo();
  
  // Check current page
  if (isVideoPage()) {
    handleVideoPage();
    // Inject Watch Party button next to Like/Share
    setTimeout(injectWatchPartyButton, 1500);
  }
  
  // Set up navigation observer for YouTube SPA
  setupNavigationObserver();
  
  // Listen for messages from service worker
  setupMessageListener();
  
  console.log('[WatchParty Content] Initialized');
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

// ============================================
// Video Page Detection
// ============================================

function isVideoPage(): boolean {
  return window.location.pathname === '/watch' && 
         new URLSearchParams(window.location.search).has('v');
}

function getVideoId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('v');
}

async function handleVideoPage(): Promise<void> {
  const videoId = getVideoId();
  
  if (!videoId) {
    console.log('[WatchParty Content] No video ID found');
    return;
  }
  
  if (videoId === currentVideoId && overlayInjected) {
    return;
  }
  
  currentVideoId = videoId;
  console.log('[WatchParty Content] Video detected:', videoId);
  
  // Check if this video is scheduled
  const response = await sendMessage<CheckScheduledResponse>({
    type: 'CHECK_SCHEDULED',
    videoId,
  });
  
  if (response.isScheduled && response.show) {
    console.log('[WatchParty Content] Video is scheduled:', response.show.title);
    currentShow = response.show;
    syncTimestamp = response.currentTimestamp;
    
    // Preload next video ID immediately
    loadNextVideo();
    
    // Set up video ended listener
    setupVideoEndedListener();
    
    // Join chat room
    const joinResponse = await sendMessage<{ success: boolean; messages: ChatMessage[] }>({
      type: 'JOIN_CHAT',
      showId: response.show.id,
    });
    
    if (joinResponse.success) {
      messages = joinResponse.messages || [];
    }
    
    showOverlay();
  } else {
    console.log('[WatchParty Content] Video is not scheduled');
    currentShow = null;
    hideOverlay();
  }
}

// ============================================
// Navigation Observer (YouTube SPA)
// ============================================

function setupNavigationObserver(): void {
  let lastUrl = location.href;
  
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log('[WatchParty Content] Navigation detected:', lastUrl);
      
      // Leave current chat
      if (currentShow) {
        sendMessage({ type: 'LEAVE_CHAT', showId: currentShow.id });
      }
      
      // Reset state
      currentVideoId = null;
      currentShow = null;
      messages = [];
      
      if (isVideoPage()) {
        setTimeout(handleVideoPage, 500);
        // Re-inject button on new video page
        watchPartyButtonInjected = false;
        setTimeout(injectWatchPartyButton, 1500);
      } else {
        hideOverlay();
        removeWatchPartyButton();
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ============================================
// Message Handling
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
    case 'NEW_MESSAGE':
      messages.push(message.message);
      if (messages.length > 200) {
        messages = messages.slice(-200);
      }
      updateOverlayMessages();
      break;
    
    case 'USER_COUNT_UPDATE':
      viewerCount = message.count;
      updateOverlayViewerCount();
      break;
    
    case 'SYNC_UPDATE':
      syncTimestamp = message.timestamp;
      updateOverlaySyncStatus();
      break;
    
    case 'CONNECTION_STATUS':
      connectionStatus = message.status;
      updateOverlayConnectionStatus();
      break;
    
    case 'HIDE_OVERLAY':
      hideOverlay();
      break;
    
    case 'NAVIGATE_TO_VIDEO':
      // Only navigate if we have an overlay (i.e., we're watching a scheduled video)
      if (overlayInjected && currentShow) {
        console.log('[WatchParty Content] Navigating to next video:', message.videoId);
        const url = `https://www.youtube.com/watch?v=${message.videoId}&t=${message.timestamp}`;
        window.location.href = url;
      }
      break;
  }
}

async function sendMessage<T>(message: ContentToBackgroundMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

// ============================================
// Video Ended Listener
// ============================================

async function loadNextVideo(): Promise<void> {
  try {
    const response = await sendMessage<{ nextVideoId: string | null }>({
      type: 'GET_NEXT_VIDEO',
    });
    
    nextVideoId = response.nextVideoId;
    
    if (nextVideoId) {
      console.log('[WatchParty Content] Preloaded next video:', nextVideoId);
    } else {
      console.log('[WatchParty Content] No next video in queue');
    }
  } catch (error) {
    console.error('[WatchParty Content] Failed to load next video:', error);
    nextVideoId = null;
  }
}

function setupVideoEndedListener(): void {
  // Find the video element
  const findVideo = () => document.querySelector('video');
  
  const attachListener = () => {
    const video = findVideo();
    if (!video) {
      // Retry after a short delay
      setTimeout(attachListener, 500);
      return;
    }
    
    console.log('[WatchParty Content] Attached video ended listener');
    
    video.addEventListener('ended', () => {
      console.log('[WatchParty Content] Video ended, pausing to prevent autoplay');
      
      // Immediately pause to prevent YouTube autoplay
      video.pause();
      
      // Navigate to next video if we have it preloaded
      if (nextVideoId) {
        console.log('[WatchParty Content] Instantly navigating to preloaded next video:', nextVideoId);
        window.location.href = `https://www.youtube.com/watch?v=${nextVideoId}&t=0`;
      } else {
        console.log('[WatchParty Content] No next video, staying on current page');
      }
      
      // Still notify service worker for server-side tracking
      if (currentShow) {
        sendMessage({
          type: 'VIDEO_ENDED',
          videoId: currentShow.videoId,
          showId: currentShow.id,
        });
      }
    }, { once: false }); // Don't use once, in case user rewinds
  };
  
  attachListener();
}

// ============================================
// Overlay Management
// ============================================

function showOverlay(): void {
  if (overlayInjected) {
    updateOverlay();
    return;
  }
  
  console.log('[WatchParty Content] Injecting overlay');
  
  // Create container
  const container = document.createElement('div');
  container.id = 'watch-party-root';
  
  // Create shadow DOM for style isolation
  const shadowRoot = container.attachShadow({ mode: 'open' });
  
  // Inject styles
  const styles = document.createElement('style');
  styles.textContent = getOverlayStyles();
  shadowRoot.appendChild(styles);
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'watch-party-overlay';
  overlay.id = 'wp-overlay';
  shadowRoot.appendChild(overlay);
  
  document.body.appendChild(container);
  overlayInjected = true;
  
  // Render content
  updateOverlay();
}

function hideOverlay(): void {
  const container = document.getElementById('watch-party-root');
  if (container) {
    container.remove();
    overlayInjected = false;
    console.log('[WatchParty Content] Overlay removed');
  }
}

function updateOverlay(): void {
  const container = document.getElementById('watch-party-root');
  if (!container?.shadowRoot) return;
  
  const overlay = container.shadowRoot.getElementById('wp-overlay');
  if (!overlay) return;
  
  overlay.innerHTML = renderOverlayHTML();
  setupOverlayListeners(container.shadowRoot);
}

function updateOverlayMessages(): void {
  const container = document.getElementById('watch-party-root');
  if (!container?.shadowRoot) return;
  
  const messagesContainer = container.shadowRoot.querySelector('.chat-messages');
  if (!messagesContainer) return;
  
  messagesContainer.innerHTML = renderMessagesHTML();
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateOverlayViewerCount(): void {
  const container = document.getElementById('watch-party-root');
  if (!container?.shadowRoot) return;
  
  const viewerCountEl = container.shadowRoot.querySelector('.viewer-count');
  if (viewerCountEl) {
    viewerCountEl.textContent = `${viewerCount} watching`;
  }
}

function updateOverlaySyncStatus(): void {
  const container = document.getElementById('watch-party-root');
  if (!container?.shadowRoot) return;
  
  const syncEl = container.shadowRoot.querySelector('.sync-indicator');
  if (syncEl && currentShow) {
    const videoEl = document.querySelector('video');
    const currentTime = videoEl?.currentTime || 0;
    const diff = Math.abs(syncTimestamp - currentTime);
    
    if (diff <= 5) {
      syncEl.className = 'sync-indicator synced';
      syncEl.innerHTML = `<span>✓ Synced at ${formatTime(syncTimestamp)}</span>`;
    } else {
      syncEl.className = 'sync-indicator out-of-sync';
      syncEl.innerHTML = `
        <span>⚠ ${Math.round(diff)}s ${currentTime < syncTimestamp ? 'behind' : 'ahead'}</span>
        <button class="sync-btn">Sync Now</button>
      `;
      
      // Add sync button listener
      const syncBtn = syncEl.querySelector('.sync-btn');
      syncBtn?.addEventListener('click', () => {
        const video = document.querySelector('video');
        if (video) {
          video.currentTime = syncTimestamp;
        }
      });
    }
  }
}

function updateOverlayConnectionStatus(): void {
  const container = document.getElementById('watch-party-root');
  if (!container?.shadowRoot) return;
  
  const statusEl = container.shadowRoot.querySelector('.connection-status');
  if (statusEl) {
    statusEl.className = `connection-status ${connectionStatus}`;
    statusEl.innerHTML = `<span class="status-dot"></span>${
      connectionStatus === 'connected' ? 'Connected' :
      connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'
    }`;
  }
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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

// ============================================
// Overlay HTML Rendering
// ============================================

function renderOverlayHTML(): string {
  const showTitle = currentShow?.title || 'Watch Party';
  const displayUsername = username || `User_${userId?.substring(5, 10) || 'anon'}`;
  
  return `
    <div class="chat-header">
      <div class="chat-header-left">
        <span class="chat-title">${showTitle}</span>
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
      <div class="sync-indicator synced">
        <span>✓ Synced</span>
      </div>
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
        <input type="text" class="chat-input" placeholder="Send a message..." maxlength="300" ${!username ? 'disabled' : ''}>
        <span class="char-count">0/300</span>
        <button class="send-btn" title="Send" ${!username ? 'disabled' : ''}>➤</button>
      </div>
      ${!username ? '<div class="username-prompt">Set a username to start chatting</div>' : ''}
    </div>
    
    <!-- Username Modal -->
    <div class="username-modal" style="display: none;">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Set your username</h3>
          <button class="modal-close-btn">×</button>
        </div>
        <div class="modal-body">
          <input type="text" class="username-input" placeholder="Enter username" maxlength="20" value="${username || ''}">
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
    return `
      <div class="chat-message system">
        <span class="msg-text">Welcome to the watch party! Be the first to say something.</span>
      </div>
    `;
  }
  
  return messages.map(msg => {
    const color = getColorForUsername(msg.username);
    const isOwn = msg.userId === userId;
    
    return `
      <div class="chat-message ${isOwn ? 'own' : ''}">
        <span class="msg-avatar" style="background: ${color};">${msg.username.charAt(0).toUpperCase()}</span>
        <div class="msg-content">
          <div class="msg-header">
            <span class="msg-username" style="color: ${color};">${msg.username}</span>
            <span class="msg-time">${formatRelativeTime(msg.timestamp)}</span>
          </div>
          <p class="msg-text">${escapeHtml(msg.message)}</p>
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

// ============================================
// Event Listeners
// ============================================

function setupOverlayListeners(shadowRoot: ShadowRoot): void {
  // Stop keyboard events from propagating to YouTube when typing in chat
  const overlayEl = shadowRoot.querySelector('.watch-party-overlay');
  overlayEl?.addEventListener('keydown', (e) => {
    e.stopPropagation();
  });
  overlayEl?.addEventListener('keyup', (e) => {
    e.stopPropagation();
  });
  overlayEl?.addEventListener('keypress', (e) => {
    e.stopPropagation();
  });
  
  // Close button
  const closeBtn = shadowRoot.querySelector('.close-btn');
  closeBtn?.addEventListener('click', () => {
    if (currentShow) {
      sendMessage({ type: 'LEAVE_CHAT', showId: currentShow.id });
    }
    hideOverlay();
  });
  
  // Collapse button
  const collapseBtn = shadowRoot.querySelector('.collapse-btn');
  const overlay = shadowRoot.querySelector('.watch-party-overlay');
  collapseBtn?.addEventListener('click', () => {
    overlay?.classList.toggle('collapsed');
    if (collapseBtn.textContent === '−') {
      collapseBtn.textContent = '+';
    } else {
      collapseBtn.textContent = '−';
    }
  });
  
  // Chat input
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
  
  // Username change
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
    
    // Validate
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
    
    // Save username
    const response = await sendMessage<{ success: boolean; error?: string }>({
      type: 'SET_USERNAME',
      username: newUsername,
    });
    
    if (response.success) {
      username = newUsername;
      closeModal();
      updateOverlay();
      
      // Rejoin chat with new username
      if (currentShow) {
        await sendMessage({ type: 'LEAVE_CHAT', showId: currentShow.id });
        await sendMessage({ type: 'JOIN_CHAT', showId: currentShow.id });
      }
    } else {
      if (usernameError) {
        usernameError.textContent = response.error || 'Failed to save username';
        usernameError.style.display = 'block';
      }
    }
  });
  
  // Scroll to bottom
  const messagesContainer = shadowRoot.querySelector('.chat-messages');
  if (messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

async function sendChatMessage(message: string): Promise<void> {
  if (!currentShow || !username) return;
  
  console.log('[WatchParty Content] Sending message:', message);
  
  const response = await sendMessage<{ success: boolean; error?: string }>({
    type: 'SEND_MESSAGE',
    message,
    showId: currentShow.id,
  });
  
  if (!response.success) {
    console.error('[WatchParty Content] Failed to send message:', response.error);
    // TODO: Show error toast
  }
}

// ============================================
// Overlay Styles
// ============================================

function getOverlayStyles(): string {
  return `
    :host {
      all: initial;
      font-family: 'Roboto', 'Arial', sans-serif;
    }
    
    .watch-party-overlay {
      position: fixed;
      top: 56px;
      right: 0;
      width: 350px;
      height: calc(100vh - 56px);
      background: rgba(15, 15, 15, 0.98);
      border-left: 1px solid #303030;
      display: flex;
      flex-direction: column;
      z-index: 9999;
      animation: slideIn 0.2s ease-out;
      font-size: 14px;
      color: #f1f1f1;
    }
    
    .watch-party-overlay.collapsed {
      width: 50px;
    }
    
    .watch-party-overlay.collapsed .chat-body,
    .watch-party-overlay.collapsed .chat-input-area,
    .watch-party-overlay.collapsed .chat-title,
    .watch-party-overlay.collapsed .chat-viewers {
      display: none;
    }
    
    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    
    .chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      border-bottom: 1px solid #303030;
      background: #212121;
      flex-shrink: 0;
    }
    
    .chat-header-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }
    
    .chat-title {
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .chat-viewers {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #aaa;
    }
    
    .live-dot {
      width: 8px;
      height: 8px;
      background: #ff0000;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .chat-header-right {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    
    .icon-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 50%;
      color: #f1f1f1;
      font-size: 18px;
      cursor: pointer;
      transition: background 0.1s;
    }
    
    .icon-btn:hover {
      background: #3f3f3f;
    }
    
    .chat-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }
    
    .sync-indicator {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      font-size: 12px;
      background: rgba(43, 166, 64, 0.1);
      color: #2ba640;
      flex-shrink: 0;
    }
    
    .sync-indicator.out-of-sync {
      background: rgba(249, 168, 37, 0.1);
      color: #f9a825;
    }
    
    .sync-btn {
      padding: 4px 8px;
      font-size: 11px;
      background: rgba(249, 168, 37, 0.2);
      border: none;
      border-radius: 4px;
      color: #f9a825;
      cursor: pointer;
    }
    
    .sync-btn:hover {
      background: rgba(249, 168, 37, 0.3);
    }
    
    .connection-status {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      font-size: 11px;
      background: #1a1a1a;
      color: #aaa;
      flex-shrink: 0;
    }
    
    .connection-status .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #717171;
    }
    
    .connection-status.connected .status-dot {
      background: #2ba640;
    }
    
    .connection-status.reconnecting .status-dot {
      background: #f9a825;
      animation: pulse 1s infinite;
    }
    
    .connection-status.disconnected .status-dot {
      background: #ff4e45;
    }
    
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .chat-messages::-webkit-scrollbar {
      width: 8px;
    }
    
    .chat-messages::-webkit-scrollbar-track {
      background: transparent;
    }
    
    .chat-messages::-webkit-scrollbar-thumb {
      background: #3f3f3f;
      border-radius: 4px;
    }
    
    .chat-messages::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    
    .chat-message {
      display: flex;
      gap: 8px;
      animation: fadeIn 0.15s ease-out;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .chat-message.system {
      justify-content: center;
    }
    
    .chat-message.system .msg-text {
      color: #717171;
      font-size: 12px;
      font-style: italic;
      text-align: center;
    }
    
    .msg-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 500;
      color: white;
      flex-shrink: 0;
    }
    
    .msg-content {
      flex: 1;
      min-width: 0;
    }
    
    .msg-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 2px;
    }
    
    .msg-username {
      font-size: 13px;
      font-weight: 500;
    }
    
    .msg-time {
      font-size: 11px;
      color: #717171;
    }
    
    .msg-text {
      font-size: 14px;
      line-height: 1.4;
      word-wrap: break-word;
      color: #f1f1f1;
    }
    
    .chat-input-area {
      padding: 12px;
      border-top: 1px solid #303030;
      background: #181818;
      flex-shrink: 0;
    }
    
    .chat-user-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 12px;
      color: #aaa;
    }
    
    .username-display {
      color: #f1f1f1;
    }
    
    .change-username-btn {
      padding: 2px 8px;
      font-size: 11px;
      background: transparent;
      border: 1px solid #3f3f3f;
      border-radius: 4px;
      color: #3ea6ff;
      cursor: pointer;
    }
    
    .change-username-btn:hover {
      background: rgba(62, 166, 255, 0.1);
    }
    
    .chat-input-container {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #272727;
      border-radius: 20px;
      padding: 4px 8px;
    }
    
    .chat-input {
      flex: 1;
      height: 32px;
      padding: 0 8px;
      font-family: inherit;
      font-size: 14px;
      color: #f1f1f1;
      background: transparent;
      border: none;
      outline: none;
    }
    
    .chat-input::placeholder {
      color: #717171;
    }
    
    .chat-input:disabled {
      cursor: not-allowed;
    }
    
    .char-count {
      font-size: 11px;
      color: #717171;
    }
    
    .char-count.warning {
      color: #f9a825;
    }
    
    .send-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 50%;
      color: #3ea6ff;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.1s;
    }
    
    .send-btn:hover:not(:disabled) {
      background: rgba(62, 166, 255, 0.1);
    }
    
    .send-btn:disabled {
      color: #717171;
      cursor: not-allowed;
    }
    
    .username-prompt {
      margin-top: 8px;
      padding: 8px;
      font-size: 12px;
      color: #f9a825;
      background: rgba(249, 168, 37, 0.1);
      border-radius: 4px;
      text-align: center;
    }
    
    /* Username Modal */
    .username-modal {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    }
    
    .modal-content {
      width: 300px;
      background: #212121;
      border-radius: 12px;
      overflow: hidden;
    }
    
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid #303030;
    }
    
    .modal-header h3 {
      font-size: 16px;
      font-weight: 500;
      margin: 0;
    }
    
    .modal-close-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 50%;
      color: #aaa;
      font-size: 18px;
      cursor: pointer;
    }
    
    .modal-close-btn:hover {
      background: #3f3f3f;
      color: #f1f1f1;
    }
    
    .modal-body {
      padding: 16px;
    }
    
    .username-input {
      width: 100%;
      height: 40px;
      padding: 0 12px;
      font-family: inherit;
      font-size: 14px;
      color: #f1f1f1;
      background: #0f0f0f;
      border: 1px solid #303030;
      border-radius: 4px;
      outline: none;
    }
    
    .username-input:focus {
      border-color: #3ea6ff;
    }
    
    .username-hint {
      margin-top: 8px;
      font-size: 12px;
      color: #717171;
    }
    
    .username-error {
      margin-top: 8px;
      font-size: 12px;
      color: #ff4e45;
    }
    
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 16px;
      border-top: 1px solid #303030;
    }
    
    .modal-cancel-btn {
      padding: 8px 16px;
      font-family: inherit;
      font-size: 14px;
      background: transparent;
      border: none;
      border-radius: 18px;
      color: #3ea6ff;
      cursor: pointer;
    }
    
    .modal-cancel-btn:hover {
      background: rgba(62, 166, 255, 0.1);
    }
    
    .modal-save-btn {
      padding: 8px 16px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      background: #f1f1f1;
      border: none;
      border-radius: 18px;
      color: #0f0f0f;
      cursor: pointer;
    }
    
    .modal-save-btn:hover {
      background: #d9d9d9;
    }
  `;
}

// ============================================
// YouTube Watch Party Button
// ============================================

let watchPartyButtonInjected = false;

function injectWatchPartyButton(): void {
  if (watchPartyButtonInjected) return;
  if (!isVideoPage()) return;
  
  // YouTube's action buttons container (next to Like/Share/etc.)
  const actionsContainer = document.querySelector('#actions #actions-inner #menu ytd-menu-renderer #top-level-buttons-computed');
  
  if (!actionsContainer) {
    // Retry — YouTube may not have rendered yet
    setTimeout(injectWatchPartyButton, 1000);
    return;
  }
  
  // Check if already injected
  if (actionsContainer.querySelector('#watch-party-yt-btn')) return;
  
  const btn = document.createElement('button');
  btn.id = 'watch-party-yt-btn';
  btn.title = 'Watch Party';
  btn.setAttribute('aria-label', 'Watch Party');
  
  // Match YouTube's pill button styling
  Object.assign(btn.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    height: '36px',
    padding: '0 16px',
    marginLeft: '8px',
    fontFamily: '"Roboto", "Arial", sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#fff',
    background: 'linear-gradient(135deg, #ff4444, #ff6b6b)',
    border: 'none',
    borderRadius: '18px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap' as string,
    position: 'relative' as string,
    overflow: 'hidden' as string,
  });
  
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="flex-shrink:0">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
    </svg>
    <span>Watch Party</span>
  `;
  
  // Hover effects
  btn.addEventListener('mouseenter', () => {
    btn.style.boxShadow = '0 4px 12px rgba(255, 68, 68, 0.4)';
    btn.style.transform = 'translateY(-1px)';
  });
  
  btn.addEventListener('mouseleave', () => {
    btn.style.boxShadow = 'none';
    btn.style.transform = 'translateY(0)';
  });
  
  // Click handler — open extension popup
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Send message to background to trigger popup or handle session
    chrome.runtime.sendMessage({ type: 'GET_SESSION_STATUS' }, (response) => {
      if (response?.active) {
        // If already in a session, show the overlay
        if (!overlayInjected && currentShow) {
          showOverlay();
        }
      }
      // Always try to open the popup
      // Note: Chrome extensions can't programmatically open the popup,
      // but we can signal the user by highlighting the extension icon
      chrome.runtime.sendMessage({ type: 'GET_SCHEDULE' });
    });
    
    // Show a small tooltip
    showButtonTooltip(btn, 'Click the extension icon ▶ to start!');
  });
  
  actionsContainer.appendChild(btn);
  watchPartyButtonInjected = true;
  console.log('[WatchParty Content] Watch Party button injected');
}

function showButtonTooltip(anchor: HTMLElement, text: string): void {
  // Remove existing tooltip if any
  const existing = document.getElementById('wp-yt-tooltip');
  if (existing) existing.remove();
  
  const tooltip = document.createElement('div');
  tooltip.id = 'wp-yt-tooltip';
  Object.assign(tooltip.style, {
    position: 'absolute',
    top: `${anchor.getBoundingClientRect().bottom + window.scrollY + 8}px`,
    left: `${anchor.getBoundingClientRect().left + window.scrollX}px`,
    padding: '8px 12px',
    background: '#212121',
    color: '#f1f1f1',
    fontSize: '12px',
    fontFamily: '"Roboto", "Arial", sans-serif',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    border: '1px solid #303030',
    zIndex: '99999',
    animation: 'fadeIn 0.2s ease-out',
    whiteSpace: 'nowrap',
  });
  tooltip.textContent = text;
  document.body.appendChild(tooltip);
  
  setTimeout(() => tooltip.remove(), 3000);
}

function removeWatchPartyButton(): void {
  const btn = document.getElementById('watch-party-yt-btn');
  if (btn) {
    btn.remove();
    watchPartyButtonInjected = false;
  }
  const tooltip = document.getElementById('wp-yt-tooltip');
  if (tooltip) tooltip.remove();
}

// ============================================
// Start
// ============================================

initialize();

