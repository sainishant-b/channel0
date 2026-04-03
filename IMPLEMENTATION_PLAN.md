# Watch Party Chrome Extension - Implementation Plan

## Overview

This document outlines the step-by-step implementation plan for building the Watch Party Coordinator Chrome Extension MVP in 5 weeks.

---

## Project Structure

```
watch-party-extension/
├── manifest.json
├── package.json
├── vite.config.ts
├── tsconfig.json
│
├── src/
│   ├── background/
│   │   ├── service-worker.ts
│   │   ├── websocket-client.ts
│   │   ├── schedule-manager.ts
│   │   ├── notification-manager.ts
│   │   └── storage.ts
│   │
│   ├── content/
│   │   ├── content-script.ts
│   │   ├── video-detector.ts
│   │   ├── overlay/
│   │   │   ├── ChatOverlay.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── SyncIndicator.tsx
│   │   │   └── overlay.css
│   │   └── inject.ts
│   │
│   ├── popup/
│   │   ├── popup.html
│   │   ├── Popup.tsx
│   │   ├── NowPlaying.tsx
│   │   ├── ScheduleList.tsx
│   │   ├── ScheduleItem.tsx
│   │   └── popup.css
│   │
│   ├── options/
│   │   ├── options.html
│   │   ├── Options.tsx
│   │   └── options.css
│   │
│   ├── shared/
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   ├── api-client.ts
│   │   ├── time-utils.ts
│   │   └── message-types.ts
│   │
│   └── styles/
│       ├── variables.css
│       └── components.css
│
├── public/
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
│
└── server/
    ├── package.json
    ├── src/
    │   ├── index.ts
    │   ├── websocket-server.ts
    │   ├── routes/
    │   │   ├── schedule.ts
    │   │   └── chat.ts
    │   ├── services/
    │   │   ├── schedule-service.ts
    │   │   └── chat-service.ts
    │   └── data/
    │       └── schedule.json
    └── tsconfig.json
```

---

## Phase 1: Foundation (Week 1)

### Goals
- Set up development environment
- Create extension scaffold with Manifest V3
- Basic service worker and content script
- Extension popup shell
- Backend server skeleton

### Tasks

#### 1.1 Project Setup (Day 1)

**Extension Setup:**
- [ ] Initialize npm project with TypeScript
- [ ] Configure Vite for Chrome extension bundling
- [ ] Set up ESLint + Prettier
- [ ] Create manifest.json (Manifest V3)
- [ ] Create directory structure

**Dependencies:**
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "socket.io-client": "^4.7.0",
    "dompurify": "^3.0.0"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.260",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "@crxjs/vite-plugin": "^2.0.0-beta.23"
  }
}
```

**Deliverables:**
- Working build pipeline
- Extension loads in Chrome without errors

#### 1.2 Manifest Configuration (Day 1)

```json
{
  "manifest_version": 3,
  "name": "Watch Party Coordinator",
  "version": "1.0.0",
  "description": "Watch YouTube together with synchronized chat",
  "permissions": ["storage", "notifications", "alarms", "tabs"],
  "host_permissions": ["https://www.youtube.com/*", "https://youtu.be/*"],
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["https://www.youtube.com/watch*"],
    "js": ["src/content/content-script.js"],
    "css": ["src/content/overlay/overlay.css"],
    "run_at": "document_idle"
  }],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": {
      "16": "public/icons/icon16.png",
      "48": "public/icons/icon48.png"
    }
  },
  "icons": {
    "16": "public/icons/icon16.png",
    "48": "public/icons/icon48.png",
    "128": "public/icons/icon128.png"
  }
}
```

#### 1.3 Service Worker Skeleton (Day 2)

**File: `src/background/service-worker.ts`**

```typescript
// Core responsibilities:
// 1. Maintain WebSocket connection
// 2. Manage schedule data
// 3. Handle chrome.runtime messages
// 4. Send notifications
// 5. Update badge

// Key functions to implement:
- initializeExtension()
- setupMessageListeners()
- setupAlarms()
- handleInstall()
- handleStartup()
```

**Tasks:**
- [ ] Create service worker entry point
- [ ] Set up chrome.runtime.onInstalled listener
- [ ] Set up chrome.runtime.onMessage listener
- [ ] Create keep-alive alarm (every 4 minutes)
- [ ] Basic logging for debugging

#### 1.4 Content Script Skeleton (Day 2-3)

**File: `src/content/content-script.ts`**

```typescript
// Core responsibilities:
// 1. Detect YouTube video page
// 2. Extract video ID
// 3. Inject chat overlay
// 4. Communicate with service worker
// 5. Monitor video playback

// Key functions to implement:
- detectVideoPage()
- getVideoId()
- injectOverlay()
- setupNavigationObserver()
- sendMessageToBackground()
```

**Tasks:**
- [ ] Create content script entry point
- [ ] Implement YouTube video page detection
- [ ] Set up MutationObserver for SPA navigation
- [ ] Create message passing to service worker
- [ ] Log video ID when detected

#### 1.5 Popup UI Shell (Day 3-4)

**File: `src/popup/Popup.tsx`**

```tsx
// Components to create:
- Popup (main container)
- Header (logo, settings icon)
- NowPlaying (placeholder)
- ScheduleList (placeholder)
- Footer (links)
```

**Tasks:**
- [ ] Create popup.html entry point
- [ ] Build Popup React component
- [ ] Apply YouTube-style CSS from ui-showcase
- [ ] Add placeholder content
- [ ] Test popup opens correctly

#### 1.6 Backend Server Setup (Day 4-5)

**Server Stack:**
- Node.js + Express
- Socket.io for WebSocket
- TypeScript
- JSON file for schedule storage

**File: `server/src/index.ts`**

```typescript
// Server responsibilities:
// 1. Serve schedule API
// 2. Handle WebSocket connections
// 3. Broadcast chat messages
// 4. Track active users per show

// Endpoints:
GET  /api/schedule     - Full schedule
GET  /api/current      - Current show + timestamp
GET  /api/chat/:showId - Chat history

// WebSocket events:
- connection
- join (showId, userId, username)
- message (showId, content)
- disconnect
```

**Tasks:**
- [ ] Initialize server project
- [ ] Set up Express with CORS
- [ ] Create schedule.json with sample data
- [ ] Implement /api/schedule endpoint
- [ ] Implement /api/current endpoint
- [ ] Basic Socket.io setup (connection logging)

#### 1.7 Shared Types (Day 5)

**File: `src/shared/types.ts`**

```typescript
interface Show {
  id: string;
  videoId: string;
  title: string;
  thumbnail?: string;
  duration: number; // seconds
  startTime: string; // ISO 8601
  endTime: string;
  recurring?: boolean;
  dayOfWeek?: string;
}

interface Channel {
  id: string;
  name: string;
  description?: string;
  schedule: Show[];
}

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: string;
  showId: string;
}

interface UserSession {
  userId: string;
  username: string;
  joinedAt: string;
}

// Message types for chrome.runtime
type BackgroundMessage = 
  | { type: 'CHECK_SCHEDULED'; videoId: string }
  | { type: 'GET_SCHEDULE' }
  | { type: 'SEND_CHAT'; message: string }
  | { type: 'SET_USERNAME'; username: string };

type ContentMessage =
  | { type: 'SHOW_OVERLAY'; show: Show; messages: ChatMessage[] }
  | { type: 'HIDE_OVERLAY' }
  | { type: 'NEW_MESSAGE'; message: ChatMessage }
  | { type: 'SYNC_UPDATE'; timestamp: number }
  | { type: 'USER_COUNT'; count: number };
```

### Phase 1 Deliverables Checklist
- [ ] Extension loads in Chrome developer mode
- [ ] Service worker starts without errors
- [ ] Content script logs video ID on YouTube
- [ ] Popup opens with placeholder UI
- [ ] Server runs and responds to /api/schedule
- [ ] Basic WebSocket connection works

---

## Phase 2: Chat System (Week 2)

### Goals
- Full WebSocket implementation
- Chat overlay on YouTube
- Message sending/receiving
- Username management
- Rate limiting

### Tasks

#### 2.1 WebSocket Client (Day 1-2)

**File: `src/background/websocket-client.ts`**

```typescript
class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private messageQueue: any[] = [];
  
  connect(): void
  disconnect(): void
  send(message: any): void
  private reconnect(): void
  private handleMessage(event: MessageEvent): void
  private handleClose(): void
  private handleError(error: Event): void
}
```

**Tasks:**
- [ ] Implement WebSocket connection
- [ ] Add exponential backoff reconnection
- [ ] Message queue for offline messages
- [ ] Ping/pong keep-alive
- [ ] Forward messages to content scripts

#### 2.2 Chat Server Implementation (Day 2-3)

**File: `server/src/websocket-server.ts`**

```typescript
// Server-side WebSocket handling
class ChatServer {
  private io: Server;
  private rooms: Map<string, Set<string>>; // showId -> userIds
  private users: Map<string, UserSession>;
  private messageHistory: Map<string, ChatMessage[]>;
  
  handleConnection(socket: Socket): void
  handleJoin(socket: Socket, data: JoinData): void
  handleMessage(socket: Socket, data: MessageData): void
  handleDisconnect(socket: Socket): void
  broadcastToRoom(showId: string, event: string, data: any): void
  getUserCount(showId: string): number
}
```

**Tasks:**
- [ ] Implement room-based chat (per show)
- [ ] Track users per room
- [ ] Broadcast messages to room
- [ ] Store last 200 messages per room
- [ ] Send user count updates
- [ ] Implement rate limiting (5 msg/10s)

#### 2.3 Chat Overlay Component (Day 3-4)

**File: `src/content/overlay/ChatOverlay.tsx`**

```tsx
const ChatOverlay: React.FC<Props> = ({ show, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  
  // Components:
  // - ChatHeader (title, viewer count, collapse/close buttons)
  // - SyncIndicator (synced status)
  // - MessageList (scrollable, auto-scroll)
  // - ChatInput (username display, input field, send button)
  
  return (
    <div className="watch-party-overlay">
      <ChatHeader />
      <SyncIndicator />
      <MessageList messages={messages} />
      <ChatInput onSend={handleSend} />
    </div>
  );
};
```

**Tasks:**
- [ ] Create ChatOverlay container with Shadow DOM
- [ ] Implement ChatHeader component
- [ ] Implement MessageList with auto-scroll
- [ ] Implement ChatMessage component
- [ ] Implement ChatInput component
- [ ] Style to match YouTube (from ui-showcase)
- [ ] Handle collapse/expand states

#### 2.4 Shadow DOM Injection (Day 4)

**File: `src/content/inject.ts`**

```typescript
function injectChatOverlay(show: Show): void {
  // 1. Create container element
  const container = document.createElement('div');
  container.id = 'watch-party-root';
  
  // 2. Attach shadow DOM
  const shadowRoot = container.attachShadow({ mode: 'open' });
  
  // 3. Inject styles
  const styles = document.createElement('style');
  styles.textContent = overlayStyles;
  shadowRoot.appendChild(styles);
  
  // 4. Create React root
  const appRoot = document.createElement('div');
  shadowRoot.appendChild(appRoot);
  
  // 5. Render React component
  ReactDOM.createRoot(appRoot).render(<ChatOverlay show={show} />);
  
  // 6. Append to body
  document.body.appendChild(container);
}
```

**Tasks:**
- [ ] Implement Shadow DOM injection
- [ ] Bundle CSS into JavaScript string
- [ ] Handle cleanup on navigation
- [ ] Position overlay correctly (right sidebar)
- [ ] Handle YouTube theater mode
- [ ] Handle fullscreen (hide overlay)

#### 2.5 Username Management (Day 5)

**File: `src/shared/storage.ts`**

```typescript
// Storage keys
const STORAGE_KEYS = {
  USERNAME: 'watchparty_username',
  USER_ID: 'watchparty_userid',
  SETTINGS: 'watchparty_settings',
};

async function getUsername(): Promise<string | null>
async function setUsername(username: string): Promise<void>
async function getUserId(): Promise<string>
function validateUsername(username: string): boolean
function generateUserId(): string
```

**Tasks:**
- [ ] Implement username storage (chrome.storage.sync)
- [ ] Generate unique user ID on first install
- [ ] Username validation (3-20 chars, alphanumeric + underscore)
- [ ] Username prompt in overlay
- [ ] Change username functionality

#### 2.6 Message Sanitization (Day 5)

**Tasks:**
- [ ] Integrate DOMPurify
- [ ] Sanitize all incoming messages
- [ ] Implement basic profanity filter
- [ ] Character limit enforcement (300 chars)
- [ ] XSS protection

### Phase 2 Deliverables Checklist
- [ ] WebSocket connects and reconnects reliably
- [ ] Chat overlay appears on YouTube video pages
- [ ] Can send and receive messages in real-time
- [ ] Messages appear for all connected users
- [ ] Username persists across sessions
- [ ] Rate limiting prevents spam
- [ ] No XSS vulnerabilities

---

## Phase 3: Schedule & Video Detection (Week 3)

### Goals
- Schedule fetching and caching
- Video detection and matching
- Timestamp synchronization
- "Watch Now" navigation
- Popup schedule display

### Tasks

#### 3.1 Schedule Manager (Day 1)

**File: `src/background/schedule-manager.ts`**

```typescript
class ScheduleManager {
  private schedule: Channel[] = [];
  private lastFetch: number = 0;
  private readonly CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours
  
  async fetchSchedule(): Promise<Channel[]>
  async getSchedule(): Promise<Channel[]>
  getCurrentShow(): Show | null
  getUpcomingShows(limit: number): Show[]
  isVideoScheduled(videoId: string): Show | null
  calculateCurrentTimestamp(show: Show): number
  private cacheSchedule(schedule: Channel[]): Promise<void>
  private loadCachedSchedule(): Promise<Channel[] | null>
}
```

**Tasks:**
- [ ] Fetch schedule from server
- [ ] Cache in chrome.storage.local
- [ ] Calculate current show based on time
- [ ] Get upcoming shows
- [ ] Check if video ID matches schedule
- [ ] Calculate current timestamp for show

#### 3.2 Video Detection Enhancement (Day 1-2)

**File: `src/content/video-detector.ts`**

```typescript
class VideoDetector {
  private videoElement: HTMLVideoElement | null = null;
  private currentVideoId: string | null = null;
  
  detectVideo(): { videoId: string; element: HTMLVideoElement } | null
  getCurrentTime(): number
  seekTo(timestamp: number): void
  isPlaying(): boolean
  onTimeUpdate(callback: (time: number) => void): void
  private setupVideoListeners(): void
}
```

**Tasks:**
- [ ] Robust video element detection
- [ ] Extract video ID from URL
- [ ] Monitor video playback state
- [ ] Get current playback time
- [ ] Seek to specific timestamp
- [ ] Handle YouTube's dynamic loading

#### 3.3 Timestamp Synchronization (Day 2-3)

**Sync Logic:**
```typescript
// Server calculates expected timestamp
function calculateExpectedTimestamp(show: Show): number {
  const now = Date.now();
  const startTime = new Date(show.startTime).getTime();
  const elapsedSeconds = Math.floor((now - startTime) / 1000);
  return Math.min(elapsedSeconds, show.duration);
}

// Client checks sync status
function checkSyncStatus(expected: number, actual: number): SyncStatus {
  const drift = Math.abs(expected - actual);
  if (drift <= 5) return 'synced';
  if (drift <= 30) return 'slightly-behind';
  return 'out-of-sync';
}
```

**Tasks:**
- [ ] Server broadcasts timestamp every 5 seconds
- [ ] Client receives and compares with video time
- [ ] Show sync indicator in overlay
- [ ] "Sync Now" button to seek to correct time
- [ ] Handle edge cases (video paused, buffering)

#### 3.4 Watch Now Navigation (Day 3)

**Implementation:**
```typescript
function navigateToShow(show: Show): void {
  const timestamp = calculateExpectedTimestamp(show);
  const url = `https://www.youtube.com/watch?v=${show.videoId}&t=${timestamp}`;
  
  // Option 1: Open in new tab
  chrome.tabs.create({ url });
  
  // Option 2: Navigate current tab (based on user setting)
  chrome.tabs.update({ url });
}
```

**Tasks:**
- [ ] Generate YouTube URL with timestamp
- [ ] Handle navigation from popup
- [ ] Handle navigation from notification
- [ ] User preference for new tab vs current tab

#### 3.5 Popup Schedule Display (Day 4-5)

**File: `src/popup/Popup.tsx`**

```tsx
const Popup: React.FC = () => {
  const [currentShow, setCurrentShow] = useState<Show | null>(null);
  const [upcomingShows, setUpcomingShows] = useState<Show[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadScheduleData();
  }, []);
  
  return (
    <div className="popup-container">
      <PopupHeader />
      {currentShow ? (
        <NowPlaying show={currentShow} viewerCount={viewerCount} />
      ) : (
        <NoShowPlaying nextShow={upcomingShows[0]} />
      )}
      <ScheduleList shows={upcomingShows} />
      <PopupFooter />
    </div>
  );
};
```

**Components:**
- [ ] NowPlaying - Current show with progress, watch button
- [ ] NoShowPlaying - Message when nothing is live
- [ ] ScheduleList - Upcoming shows
- [ ] ScheduleItem - Individual show with remind button
- [ ] PopupHeader - Logo, settings
- [ ] PopupFooter - Links

**Tasks:**
- [ ] Fetch schedule data on popup open
- [ ] Display current show with live indicator
- [ ] Show progress bar with time remaining
- [ ] "Watch Now" button functionality
- [ ] Display upcoming shows with countdown
- [ ] Remind button for upcoming shows
- [ ] Handle empty schedule state

#### 3.6 Conditional Overlay Display (Day 5)

**Logic Flow:**
```typescript
// content-script.ts
async function onVideoDetected(videoId: string) {
  // 1. Check if video is scheduled
  const response = await chrome.runtime.sendMessage({
    type: 'CHECK_SCHEDULED',
    videoId
  });
  
  if (response.isScheduled) {
    // 2. Show overlay
    injectChatOverlay(response.show);
    
    // 3. Join chat room
    chrome.runtime.sendMessage({
      type: 'JOIN_CHAT',
      showId: response.show.id
    });
  } else {
    // 4. Remove overlay if exists
    removeOverlay();
  }
}
```

**Tasks:**
- [ ] Only show overlay for scheduled videos
- [ ] Handle video changes (YouTube SPA)
- [ ] Clean up overlay on navigation away
- [ ] Show "Join current show?" prompt if watching different video

### Phase 3 Deliverables Checklist
- [ ] Schedule loads and caches correctly
- [ ] Overlay only appears for scheduled videos
- [ ] Timestamp sync works within 5 seconds
- [ ] "Watch Now" opens YouTube at correct time
- [ ] Popup displays current and upcoming shows
- [ ] Progress bar updates in real-time
- [ ] Countdown timers are accurate

---

## Phase 4: Notifications & Polish (Week 4)

### Goals
- Browser notifications
- Extension badge
- Settings page
- Error handling
- UI polish and animations

### Tasks

#### 4.1 Notification System (Day 1-2)

**File: `src/background/notification-manager.ts`**

```typescript
class NotificationManager {
  async showStartingNotification(show: Show): Promise<void> {
    await chrome.notifications.create(`show-${show.id}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `Watch Party: ${show.title}`,
      message: 'Starting now! Click to watch.',
      buttons: [
        { title: 'Watch Now' },
        { title: 'Remind in 5 min' }
      ],
      priority: 2
    });
  }
  
  async showReminderNotification(show: Show, minutesBefore: number): Promise<void>
  async scheduleReminder(show: Show, minutesBefore: number): Promise<void>
  private handleNotificationClick(notificationId: string): void
  private handleButtonClick(notificationId: string, buttonIndex: number): void
}
```

**Tasks:**
- [ ] Show notification when show starts
- [ ] Handle notification click (navigate to video)
- [ ] Implement reminder system
- [ ] Schedule reminders with chrome.alarms
- [ ] Notification settings (enable/disable, timing)

#### 4.2 Extension Badge (Day 2)

**Badge States:**
```typescript
// Live show - red background with viewer count
chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
chrome.action.setBadgeText({ text: '47' });

// Upcoming show soon - blue background
chrome.action.setBadgeBackgroundColor({ color: '#3EA6FF' });
chrome.action.setBadgeText({ text: '5m' });

// No show - clear badge
chrome.action.setBadgeText({ text: '' });
```

**Tasks:**
- [ ] Update badge when show is live
- [ ] Show viewer count on badge
- [ ] Show countdown when show starting soon
- [ ] Clear badge when no shows

#### 4.3 Settings/Options Page (Day 2-3)

**File: `src/options/Options.tsx`**

```tsx
interface Settings {
  notifications: {
    enabled: boolean;
    showStarting: boolean;
    reminderMinutes: number; // 5, 10, 15
    sound: boolean;
  };
  appearance: {
    overlayPosition: 'right' | 'left';
    overlayWidth: number;
    autoCollapse: boolean;
  };
  behavior: {
    autoSync: boolean;
    openInNewTab: boolean;
  };
}
```

**Tasks:**
- [ ] Create options.html page
- [ ] Build settings form
- [ ] Notification preferences
- [ ] Appearance settings
- [ ] Behavior settings
- [ ] Save to chrome.storage.sync
- [ ] Load settings on extension start

#### 4.4 Error Handling (Day 3-4)

**Error States to Handle:**

1. **Network Errors**
   - [ ] API fetch failures
   - [ ] WebSocket connection failures
   - [ ] Retry logic with user feedback

2. **Video Errors**
   - [ ] Video unavailable/removed
   - [ ] Video private
   - [ ] Show "Skip to next" option

3. **Chat Errors**
   - [ ] Message send failure
   - [ ] Rate limit exceeded
   - [ ] Connection lost indicator

4. **Extension Errors**
   - [ ] Service worker crash recovery
   - [ ] Storage quota exceeded
   - [ ] Permission denied

**Implementation:**
```typescript
// Error boundary for React components
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

#### 4.5 UI Polish (Day 4-5)

**Animations:**
```css
/* Overlay slide in */
.watch-party-overlay {
  animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

/* Message fade in */
.chat-message {
  animation: fadeIn 0.1s ease-out;
}

/* Progress bar smooth update */
.progress-fill {
  transition: width 1s linear;
}
```

**Tasks:**
- [ ] Smooth overlay open/close animations
- [ ] Message appear animations
- [ ] Loading states with spinners
- [ ] Hover effects on buttons
- [ ] Focus states for accessibility
- [ ] Responsive adjustments for different screen sizes

#### 4.6 Accessibility (Day 5)

**Tasks:**
- [ ] Keyboard navigation (Tab, Enter, Escape)
- [ ] Focus trap in overlay
- [ ] Screen reader announcements for new messages
- [ ] ARIA labels on interactive elements
- [ ] Color contrast verification (4.5:1 ratio)
- [ ] Reduced motion support

### Phase 4 Deliverables Checklist
- [ ] Notifications appear when shows start
- [ ] Badge shows viewer count when live
- [ ] Settings page works correctly
- [ ] Errors handled gracefully with user feedback
- [ ] Animations are smooth
- [ ] Keyboard navigation works
- [ ] No accessibility violations

---

## Phase 5: Testing & Launch (Week 5)

### Goals
- Comprehensive testing
- Bug fixes
- Chrome Web Store submission
- Documentation
- Launch preparation

### Tasks

#### 5.1 Testing (Day 1-3)

**Unit Tests:**
- [ ] Schedule calculation logic
- [ ] Timestamp sync logic
- [ ] Username validation
- [ ] Message sanitization
- [ ] Time formatting utilities

**Integration Tests:**
- [ ] WebSocket connection/reconnection
- [ ] Message flow (send → server → receive)
- [ ] Schedule fetch and cache
- [ ] Chrome storage operations

**Manual Testing Checklist:**

**Installation:**
- [ ] Fresh install works
- [ ] Update from previous version works
- [ ] Permissions prompt is clear

**YouTube Integration:**
- [ ] Overlay appears on scheduled video
- [ ] Overlay hidden on non-scheduled video
- [ ] Works in normal mode
- [ ] Works in theater mode
- [ ] Hidden in fullscreen
- [ ] Handles YouTube navigation (SPA)
- [ ] Works with YouTube dark/light theme

**Chat:**
- [ ] Messages send and appear
- [ ] Messages from others appear
- [ ] Rate limiting works
- [ ] Username change works
- [ ] Reconnection works
- [ ] History loads on join

**Schedule:**
- [ ] Current show displays correctly
- [ ] Progress bar accurate
- [ ] Countdown timers accurate
- [ ] "Watch Now" navigates correctly
- [ ] Timezone conversion correct

**Notifications:**
- [ ] Show starting notification appears
- [ ] Clicking notification opens video
- [ ] Reminders work
- [ ] Settings respected

**Edge Cases:**
- [ ] Multiple YouTube tabs
- [ ] Slow network connection
- [ ] Browser restart
- [ ] Extension update while watching
- [ ] Schedule with no shows
- [ ] Very long show titles

#### 5.2 Performance Testing (Day 2)

**Metrics to Verify:**
- [ ] Extension popup opens in <500ms
- [ ] Overlay renders in <200ms
- [ ] Message delivery <500ms latency
- [ ] Memory usage <50MB
- [ ] CPU usage minimal when idle
- [ ] No memory leaks over time

**Load Testing:**
- [ ] 50 concurrent users in chat
- [ ] 100 messages per minute
- [ ] Server handles load without degradation

#### 5.3 Bug Fixes (Day 3-4)

- [ ] Fix all critical bugs found in testing
- [ ] Fix high-priority bugs
- [ ] Document known issues for post-launch

#### 5.4 Chrome Web Store Preparation (Day 4)

**Assets to Create:**
- [ ] Icon 128x128 PNG
- [ ] Small promo tile 440x280 PNG
- [ ] Large promo tile 1400x560 PNG (optional)
- [ ] Screenshots 1280x800 PNG (at least 2)
- [ ] Demo video (optional)

**Store Listing:**
- [ ] Write compelling description
- [ ] List all features
- [ ] Explain permissions
- [ ] Add privacy policy URL
- [ ] Select appropriate category

**Privacy Policy:**
- [ ] Create privacy policy page
- [ ] Host on accessible URL
- [ ] Cover all data collection

#### 5.5 Documentation (Day 4-5)

**README.md:**
- [ ] Project overview
- [ ] Installation instructions
- [ ] Development setup
- [ ] Build commands
- [ ] Architecture overview

**User Documentation:**
- [ ] How to install
- [ ] How to use
- [ ] FAQ
- [ ] Troubleshooting

#### 5.6 Launch (Day 5)

**Pre-Launch:**
- [ ] Final testing pass
- [ ] Version number set correctly
- [ ] All assets ready
- [ ] Server deployed and stable
- [ ] Analytics configured

**Submission:**
- [ ] Submit to Chrome Web Store
- [ ] Wait for review (1-3 days typically)

**Post-Submission:**
- [ ] Prepare launch announcement
- [ ] Set up monitoring (error tracking)
- [ ] Prepare for user feedback

### Phase 5 Deliverables Checklist
- [ ] All tests passing
- [ ] No critical bugs
- [ ] Store listing complete
- [ ] Privacy policy published
- [ ] Documentation complete
- [ ] Extension submitted to Chrome Web Store

---

## Technical Decisions

### Why These Choices?

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Build Tool | Vite + @crxjs/vite-plugin | Fast builds, HMR support, excellent Chrome extension support |
| UI Framework | React 18 | Component reusability, familiar ecosystem, good for complex UI |
| Styling | CSS Variables + Plain CSS | Matches YouTube's approach, no build complexity, easy theming |
| WebSocket | Socket.io | Reliable reconnection, room support, fallback to polling |
| State Management | React useState/useContext | Simple enough for MVP, no need for Redux complexity |
| TypeScript | Yes | Type safety, better IDE support, fewer runtime errors |

### API Design

**REST Endpoints:**
```
GET /api/schedule
Response: { channels: Channel[] }

GET /api/current
Response: { show: Show | null, timestamp: number, viewerCount: number }

GET /api/chat/:showId/history
Response: { messages: ChatMessage[] }
```

**WebSocket Events:**
```
Client → Server:
- join: { showId, userId, username }
- message: { showId, content }
- leave: { showId }

Server → Client:
- welcome: { userId }
- message: { message: ChatMessage }
- userCount: { showId, count }
- sync: { showId, timestamp }
- error: { code, message }
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Service worker termination | Keep-alive alarm every 4 min, robust reconnection |
| YouTube UI changes | Use generic selectors, monitor for breaks |
| Chrome Web Store rejection | Follow guidelines strictly, clear permissions |
| WebSocket scaling | Start simple, plan Redis pub/sub for scale |
| User adoption | Focus on niche community first |

---

## Post-MVP Roadmap

**Version 1.1 (Month 2):**
- Multiple channels
- User-submitted show requests
- Basic moderation tools

**Version 1.2 (Month 3):**
- Private watch parties
- Reactions/emojis
- Firefox extension

**Version 2.0 (Month 6):**
- User accounts
- Show voting
- Mobile companion app

---

## Development Commands

```bash
# Extension development
cd watch-party-extension
npm install
npm run dev          # Start dev server with HMR
npm run build        # Production build
npm run preview      # Preview production build

# Server development
cd server
npm install
npm run dev          # Start with nodemon
npm run build        # Compile TypeScript
npm start            # Run production

# Testing
npm run test         # Run unit tests
npm run test:e2e     # Run E2E tests
npm run lint         # Run ESLint
```

---

## Timeline Summary

| Week | Focus | Key Deliverable |
|------|-------|-----------------|
| 1 | Foundation | Extension loads, basic structure |
| 2 | Chat System | Real-time chat working |
| 3 | Schedule & Sync | Video detection, timestamp sync |
| 4 | Polish | Notifications, settings, error handling |
| 5 | Launch | Testing, store submission |

**Total Estimated Hours:** 100-120 hours

---

## Next Steps

1. **Start Phase 1.1**: Initialize the extension project
2. Create manifest.json
3. Set up Vite build configuration
4. Create basic service worker
5. Test extension loads in Chrome

Ready to begin implementation!
