# Product Requirements Document: Watch Party Coordinator Chrome Extension

## 1. Product Overview

### 1.1 Vision
A Chrome extension that recreates the communal TV watching experience by coordinating scheduled YouTube content with synchronized chat, overlaying a live chat interface directly on YouTube while users watch together.

### 1.2 Problem Statement
Modern content consumption is isolated and algorithm-driven. Users miss the shared cultural moments and community that came from everyone watching the same content at the same time.

### 1.3 Solution
A Chrome extension that integrates directly into YouTube, providing scheduled programming with live chat overlay, automatically syncing users to the same timestamp and enabling real-time conversation without leaving YouTube.

### 1.4 Success Metrics (MVP)
- 100+ extension installs within first month
- 50+ DAU (Daily Active Users)
- Average session duration >20 minutes
- 70%+ of users who see a scheduled show click to watch
- 5+ messages per user per session

### 1.5 Why Chrome Extension vs Web App
- **Seamless integration**: Chat appears directly on YouTube page
- **No tab switching**: Everything happens in one place
- **Auto-detection**: Extension knows when you're watching scheduled content
- **Native feel**: Overlay blends with YouTube interface
- **Always accessible**: One click from browser toolbar
- **Better retention**: No need to remember separate website

---

## 2. Target User

### 2.1 Primary Persona
**"Alex, the Community Viewer"**
- Age: 18-35
- Behavior: Watches YouTube daily, uses Discord/Twitch, has 5-10 extensions installed
- Pain point: Watches alone, misses shared viewing experiences
- Tech comfort: High, comfortable installing extensions
- Motivation: Wants to discuss content in real-time with others

### 2.2 User Journey (MVP)
1. Discovers extension via Chrome Web Store or social media
2. Clicks "Add to Chrome" (one-time installation)
3. Extension icon appears in toolbar
4. Badge shows notification when shows are live
5. User clicks YouTube bookmark or extension popup shows schedule
6. Navigates to scheduled video (or extension auto-navigates)
7. Chat sidebar automatically appears on YouTube page
8. User watches and chats simultaneously
9. Extension reminds user of upcoming shows via notifications

---

## 3. Extension Architecture

### 3.1 Component Overview

```
Chrome Extension Structure:
├── manifest.json (Extension configuration)
├── background/ (Service Worker)
│   ├── service-worker.js
│   ├── schedule-manager.js
│   └── websocket-client.js
├── content/ (Injected into YouTube)
│   ├── content-script.js
│   ├── chat-overlay.jsx
│   ├── video-detector.js
│   └── styles.css
├── popup/ (Toolbar popup UI)
│   ├── popup.html
│   ├── popup.jsx
│   └── schedule-view.jsx
└── shared/ (Common utilities)
    ├── api-client.js
    ├── time-sync.js
    └── storage.js
```

### 3.2 Component Responsibilities

**Service Worker (Background Script)**:
- Maintains persistent WebSocket connection to chat server
- Manages schedule data and caching
- Calculates current/upcoming shows
- Sends browser notifications when shows start
- Updates extension badge with viewer count
- Handles periodic sync with server

**Content Script (YouTube Page)**:
- Detects when user is on YouTube video page
- Injects chat overlay UI
- Monitors video playback state
- Syncs with scheduled content
- Communicates with service worker via Chrome messaging API
- Handles user interactions with overlay

**Popup UI (Toolbar)**:
- Shows current/upcoming schedule
- Displays active viewer count
- Quick access to settings
- "Go to current show" button
- Mini chat view (optional)

### 3.3 Message Passing Architecture

```javascript
// Content Script → Service Worker
chrome.runtime.sendMessage({
  type: 'VIDEO_DETECTED',
  videoId: 'dQw4w9WgXcQ',
  currentTime: 125
});

// Service Worker → Content Script
chrome.tabs.sendMessage(tabId, {
  type: 'SHOW_CHAT_OVERLAY',
  showData: {...},
  chatMessages: [...]
});

// Service Worker ↔ Chat Server (WebSocket)
ws.send(JSON.stringify({
  type: 'message',
  content: 'Hello!',
  userId: 'user_123'
}));
```

---

## 4. Core Features (MVP)

### 4.1 Chat Overlay on YouTube

**Purpose**: Display live chat directly on YouTube video page

**Visual Design**:
- **Position**: Right sidebar (desktop) or bottom drawer (mobile-like narrow windows)
- **Size**: 350px width on desktop, collapsible to 50px (icon only)
- **Styling**: Dark theme to match YouTube, semi-transparent background
- **Z-index**: Above YouTube UI but below modals/dropdowns

**Components**:
- **Header Bar**:
  - "Watch Party" title
  - Current viewer count (e.g., "47 watching")
  - Collapse/expand button
  - Close button (hides overlay)
  
- **Message List**:
  - Scrollable container
  - Auto-scroll to latest message
  - Each message shows: avatar (generated from username), username, timestamp, message text
  - "You're synced" indicator at top
  
- **Input Area**:
  - Username display (click to change)
  - Message input field (300 char limit)
  - Send button
  - Character counter

**Interaction States**:
- **Collapsed**: Small icon showing viewer count, click to expand
- **Expanded**: Full chat interface visible
- **Minimized**: User can drag to resize width
- **Hidden**: User closed it, can reopen via extension icon

**Technical Implementation**:
```javascript
// content-script.js injects chat container
const chatContainer = document.createElement('div');
chatContainer.id = 'watch-party-overlay';
chatContainer.className = 'watch-party-chat';
document.body.appendChild(chatContainer);

// React root renders chat UI
const root = ReactDOM.createRoot(chatContainer);
root.render(<ChatOverlay />);
```

**Edge Cases**:
- **YouTube Theater Mode**: Overlay repositions to not cover video
- **YouTube Fullscreen**: Overlay hidden (chat paused until exit)
- **YouTube Sidebar open**: Overlay adjusts width or overlaps (user preference)
- **Multiple YouTube tabs**: Only show overlay in active tab with scheduled content

---

### 4.2 Schedule Management & Auto-Navigation

**Purpose**: Show users what's playing and automatically navigate to scheduled content

**Extension Popup Schedule View**:
- **Now Playing Card**:
  - Video thumbnail
  - Video title
  - Progress bar with time remaining
  - "Watch Now" button (navigates to video at current timestamp)
  - Current viewer count
  
- **Coming Up List**:
  - Next 3 shows
  - Each showing: thumbnail, title, start time (relative, e.g., "in 15 minutes")
  - Click to set reminder notification

**Auto-Navigation Flow**:
1. User has extension installed and is browsing Chrome
2. Show starts at scheduled time
3. Extension sends browser notification: "Show Title starting now!"
4. User clicks notification
5. Extension opens new tab to `youtube.com/watch?v={videoId}&t={timestamp}`
6. Content script detects video, shows chat overlay

**Manual Navigation**:
- User clicks "Watch Now" in popup
- Extension navigates current tab (or opens new tab based on user setting)
- Ensures timestamp parameter is correct

**Schedule Data Structure**:
```javascript
{
  "schedule": [
    {
      "id": "show_001",
      "videoId": "dQw4w9WgXcQ",
      "title": "Show Title",
      "thumbnail": "https://...",
      "duration": 600, // seconds
      "startTime": "2026-01-24T20:00:00Z",
      "endTime": "2026-01-24T20:10:00Z",
      "recurring": true,
      "dayOfWeek": "Friday"
    }
  ]
}
```

**Caching Strategy**:
- Schedule fetched on extension startup
- Cached in chrome.storage.local
- Refreshed every 6 hours
- Manual refresh button in settings

---

### 4.3 Real-Time Chat System

**Architecture**:
- Service worker maintains WebSocket connection
- Content script sends/receives messages via chrome.runtime messaging
- Messages synced across all tabs with same video

**Message Flow**:
1. User types message in overlay input
2. Content script sends to service worker
3. Service worker sends via WebSocket to chat server
4. Server broadcasts to all connected users
5. Service worker receives broadcast
6. Service worker forwards to all relevant content script tabs
7. Content script updates overlay UI

**Message Structure**:
```javascript
{
  "id": "msg_uuid_12345",
  "userId": "user_abc",
  "username": "CoolViewer42",
  "message": "This is hilarious!",
  "timestamp": "2026-01-24T20:15:30Z",
  "videoId": "dQw4w9WgXcQ", // Associated video
  "showId": "show_001" // Associated scheduled show
}
```

**Username Management**:
- First time: Prompt for username in overlay
- Stored in chrome.storage.sync (syncs across devices)
- Can change anytime by clicking current username
- Validation: 3-20 chars, alphanumeric + underscores

**Chat Features**:
- Real-time message delivery (<500ms latency)
- Auto-scroll to latest message
- Timestamp on each message (relative, e.g., "2m ago")
- Rate limiting: Max 5 messages per 10 seconds
- Profanity filter (basic word blacklist)
- "User joined" / "User left" notifications (optional)

**Persistence**:
- Last 200 messages cached in chrome.storage.local
- On reconnect, load cached messages immediately
- Then fetch latest from server

**Edge Cases**:
- **Connection lost**: Show "Reconnecting..." in overlay, queue messages
- **Video mismatch**: User watching different video than scheduled - show "Join current show?" prompt
- **Multiple tabs**: Sync read state across tabs
- **Extension updated**: Gracefully reconnect WebSocket

---

### 4.4 Video Detection & Sync

**Purpose**: Automatically detect when user is watching scheduled content and sync playback

**Detection Logic**:
```javascript
// content-script.js
const videoElement = document.querySelector('video');
const urlParams = new URLSearchParams(window.location.search);
const currentVideoId = urlParams.get('v');

// Check if this video is currently scheduled
chrome.runtime.sendMessage({
  type: 'CHECK_VIDEO',
  videoId: currentVideoId
}, (response) => {
  if (response.isScheduled) {
    showChatOverlay(response.showData);
  }
});
```

**Sync Mechanism**:
- Service worker calculates expected timestamp every second
- Content script queries video.currentTime every 5 seconds
- If drift >10 seconds, show "Out of sync" warning in overlay
- User can click "Sync Now" to jump to correct timestamp

**Sync Warning UI**:
```
⚠️ You're 15 seconds behind
[Sync Now] [Ignore]
```

**Auto-Sync (Optional Setting)**:
- If enabled, automatically seeks to correct timestamp
- Warning: Can be disruptive, disabled by default
- Good for shows with precise timing (live events)

**Playback State Detection**:
- Monitor video play/pause events
- Show "Paused" indicator in overlay
- Don't send chat messages about pauses (noisy)

---

### 4.5 Browser Notifications

**Purpose**: Alert users when shows are starting

**Notification Types**:

**1. Show Starting (High Priority)**:
```javascript
chrome.notifications.create({
  type: 'basic',
  iconUrl: 'icons/icon128.png',
  title: 'Watch Party: Show Title',
  message: 'Starting now! Click to watch.',
  buttons: [
    { title: 'Watch Now' },
    { title: 'Remind me in 5 min' }
  ],
  requireInteraction: false,
  priority: 2
});
```

**2. Upcoming Reminder (User-Requested)**:
- User clicks "Remind Me" on upcoming show
- Notification 5 minutes before start

**3. Show Ending Soon**:
- Optional: "Show ending in 5 minutes"
- Only if user is actively watching

**Notification Settings** (in extension settings):
- Enable/disable notifications
- Notification timing (5/10/15 min before)
- Sound on/off
- Do Not Disturb hours

---

### 4.6 Extension Popup Interface

**Purpose**: Quick access to schedule and settings without opening YouTube

**Layout**:
```
+---------------------------+
|  [Icon] Watch Party       |
+---------------------------+
| 🔴 LIVE: Show Title       |
| 47 watching • 12m left    |
| [Watch Now]               |
+---------------------------+
| Coming Up:                |
| ⏰ Show 2 - in 18 min     |
| ⏰ Show 3 - in 1h 5min    |
+---------------------------+
| [View Full Schedule]      |
| [Settings]                |
+---------------------------+
```

**Components**:
- **Header**: Extension logo and title
- **Live Indicator**: Red dot + current show (if any)
- **Quick Actions**: Watch Now button
- **Schedule Preview**: Next 2-3 shows
- **Footer Links**: Full schedule, settings

**Interactions**:
- Click "Watch Now": Opens/navigates to YouTube
- Click show in Coming Up: Set reminder or view details
- Click "View Full Schedule": Opens full-page schedule view
- Click "Settings": Opens extension options page

**Badge on Extension Icon**:
- Shows viewer count when show is live
- Red background when live
- Blue background for upcoming show <5 min

---

## 5. Technical Specifications

### 5.1 Manifest V3 Configuration

```json
{
  "manifest_version": 3,
  "name": "Watch Party Coordinator",
  "version": "1.0.0",
  "description": "Watch YouTube together with synchronized chat",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "permissions": [
    "storage",
    "notifications",
    "alarms",
    "tabs"
  ],
  "host_permissions": [
    "https://www.youtube.com/*",
    "https://youtu.be/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "https://www.youtube.com/watch*"
      ],
      "js": ["content/content-script.js"],
      "css": ["content/styles.css"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png"
    }
  },
  "web_accessible_resources": [
    {
      "resources": ["content/*.js", "content/*.css"],
      "matches": ["https://www.youtube.com/*"]
    }
  ]
}
```

### 5.2 Permission Justifications

**storage**: Cache schedule, user preferences, chat history
**notifications**: Alert users when shows start
**alarms**: Schedule periodic tasks (sync, cleanup)
**tabs**: Navigate to videos, detect active tab

**host_permissions (youtube.com)**: Inject chat overlay, detect video playback

---

### 5.3 Data Storage Strategy

**chrome.storage.sync** (100KB limit, syncs across devices):
- User preferences (username, theme, notification settings)
- Favorite shows
- Do Not Disturb schedule

**chrome.storage.local** (10MB limit, device-specific):
- Schedule cache (full schedule JSON)
- Chat message history (last 200 messages)
- Session data (user ID, WebSocket token)

**chrome.storage.session** (10MB, cleared on browser restart):
- Temporary state (current show, overlay visibility)
- Active tab tracking

**Storage Access Pattern**:
```javascript
// Save username
await chrome.storage.sync.set({ username: 'CoolViewer' });

// Load schedule cache
const { schedule } = await chrome.storage.local.get('schedule');

// Save chat history
await chrome.storage.local.set({ 
  chatHistory: messages.slice(-200) 
});
```

---

### 5.4 WebSocket Connection Management

**Connection Lifecycle**:
1. Extension installed/updated → Service worker starts
2. Service worker connects to WebSocket server
3. Authenticates with user ID (generated on first install)
4. Maintains persistent connection (reconnects on failure)
5. On browser close → WebSocket closes gracefully

**Reconnection Strategy**:
- Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
- Visual indicator in overlay: "Connecting...", "Connected", "Reconnecting..."
- Queue messages during disconnect, send on reconnect

**Keep-Alive**:
- Send ping every 30 seconds
- Server responds with pong
- If no pong in 45s, assume disconnected and reconnect

**Service Worker Lifecycle Issue**:
- Service workers can be terminated by browser after 5 min inactivity
- Use chrome.alarms to wake service worker every 4 minutes
- Reconnect WebSocket on wake if disconnected

```javascript
// Keep service worker alive
chrome.alarms.create('keepAlive', { periodInMinutes: 4 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // Wake up and check WebSocket
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reconnectWebSocket();
    }
  }
});
```

---

### 5.5 Content Script Injection

**Injection Timing**:
- Run at `document_idle` (after page fully loaded)
- Wait for YouTube player to be ready
- Check if video page (not homepage, search, etc.)

**Overlay Rendering**:
```javascript
// content-script.js
function injectChatOverlay() {
  // Create shadow DOM to isolate styles
  const container = document.createElement('div');
  container.id = 'watch-party-root';
  document.body.appendChild(container);
  
  const shadowRoot = container.attachShadow({ mode: 'open' });
  
  // Inject styles
  const styleSheet = document.createElement('style');
  styleSheet.textContent = overlayStyles;
  shadowRoot.appendChild(styleSheet);
  
  // Render React app
  const appRoot = document.createElement('div');
  shadowRoot.appendChild(appRoot);
  
  ReactDOM.createRoot(appRoot).render(<ChatOverlay />);
}
```

**Why Shadow DOM**:
- Isolates extension styles from YouTube styles
- Prevents conflicts with YouTube's CSS
- Encapsulation for better maintainability

**Performance Considerations**:
- Lazy load chat overlay (don't render until scheduled show detected)
- Debounce video timestamp checks
- Use React.memo for message list items
- Virtual scrolling for long chat history

---

### 5.6 Backend Architecture

**Chat Server** (Node.js + Socket.io):
- Hosted on Railway/Render ($5-10/month)
- Handles WebSocket connections from extensions
- Broadcasts chat messages
- Maintains active user count per show
- Rate limiting per user

**API Server** (Express.js):
- Serves schedule JSON
- Handles schedule updates (admin only)
- Provides chat history endpoint
- Analytics tracking

**Endpoints**:
```
GET  /api/schedule          - Get current schedule
GET  /api/current           - Get currently playing show
GET  /api/chat/history/:showId - Get recent messages
POST /api/admin/schedule    - Update schedule (auth required)
```

**WebSocket Events**:
```javascript
// Client → Server
{
  "type": "join",
  "showId": "show_001",
  "userId": "user_abc",
  "username": "CoolViewer"
}

{
  "type": "message",
  "showId": "show_001",
  "message": "Hello everyone!"
}

{
  "type": "leave",
  "showId": "show_001"
}

// Server → Client
{
  "type": "message",
  "data": {
    "id": "msg_123",
    "userId": "user_xyz",
    "username": "OtherViewer",
    "message": "Hi!",
    "timestamp": "2026-01-24T20:15:30Z"
  }
}

{
  "type": "userCount",
  "showId": "show_001",
  "count": 47
}

{
  "type": "sync",
  "showId": "show_001",
  "currentTimestamp": 125
}
```

---

## 6. User Interface Specifications

### 6.1 Chat Overlay Design

**Visual Style**:
- **Theme**: Dark (matches YouTube dark mode)
- **Colors**:
  - Background: `rgba(15, 15, 15, 0.95)` (semi-transparent)
  - Text: `#FFFFFF`
  - Secondary text: `#AAAAAA`
  - Accent: `#FF0000` (YouTube red)
  - Border: `#303030`
- **Typography**:
  - Font: Roboto (matches YouTube)
  - Message text: 14px
  - Usernames: 13px bold
  - Timestamps: 11px

**Layout Dimensions**:
- Desktop (>1280px): 350px width, full height minus YouTube header
- Laptop (1024-1280px): 300px width
- Small screens (<1024px): Bottom drawer, 200px height

**Animation**:
- Slide in from right: 200ms ease-out
- Collapse: 150ms ease-in
- New message: Subtle fade-in 100ms

**Accessibility**:
- Focus trap when overlay is active
- Keyboard navigation (Tab, Enter to send)
- Screen reader announcements for new messages
- High contrast mode support

---

### 6.2 Extension Popup Design

**Dimensions**: 360px width x 500px height

**Color Scheme**:
- Background: `#181818` (YouTube dark)
- Cards: `#282828`
- Text: `#FFFFFF` / `#AAAAAA`
- Live indicator: `#FF0000` with pulse animation

**Components Styling**:

**Live Show Card**:
```css
.live-show {
  background: linear-gradient(135deg, #282828, #1a1a1a);
  border-left: 4px solid #FF0000;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.live-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #FF0000;
  border-radius: 50%;
  animation: pulse 2s infinite;
}
```

**Watch Now Button**:
```css
.watch-now-btn {
  background: #FF0000;
  color: #FFFFFF;
  padding: 12px 24px;
  border-radius: 4px;
  font-weight: 500;
  transition: background 0.2s;
}

.watch-now-btn:hover {
  background: #CC0000;
}
```

---

### 6.3 Responsive Behavior

**Theater Mode Detection**:
```javascript
// Detect YouTube theater mode
const isTheaterMode = document.querySelector('.ytp-size-button')
  ?.classList.contains('ytp-theater-mode');

if (isTheaterMode) {
  // Reposition overlay to not cover video
  chatOverlay.style.right = '0';
  chatOverlay.style.width = '300px';
}
```

**Fullscreen Handling**:
```javascript
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    // Hide overlay in fullscreen
    chatOverlay.style.display = 'none';
  } else {
    // Restore overlay
    chatOverlay.style.display = 'block';
  }
});
```

---

## 7. User Stories & Acceptance Criteria

### 7.1 Installation & Setup

**Story 1: Install Extension**
- **As a** new user
- **I want to** install the extension easily
- **So that** I can start watching with others

**Acceptance Criteria**:
- Extension appears in Chrome Web Store
- "Add to Chrome" button installs in <5 seconds
- Extension icon appears in toolbar immediately
- First-run popup explains how to use
- No errors during installation
- Permissions clearly explained

---

**Story 2: Set Username**
- **As a** new user
- **I want to** choose my display name
- **So that** others know who I am in chat

**Acceptance Criteria**:
- Username prompt appears on first chat attempt
- Input validates 3-20 chars, alphanumeric + underscores
- Username saved to chrome.storage.sync
- Can change username anytime by clicking current name
- Username syncs across devices (Chrome sync enabled)

---

### 7.2 Watching & Chatting

**Story 3: Join Scheduled Show**
- **As a** viewer
- **I want to** see when shows are live
- **So that** I can join and watch

**Acceptance Criteria**:
- Extension badge shows red dot when show is live
- Popup shows "LIVE" indicator with show title
- Clicking "Watch Now" opens YouTube at correct timestamp
- Chat overlay appears automatically on video page
- Can see other viewers' messages in real-time

---

**Story 4: Send Chat Messages**
- **As a** viewer
- **I want to** chat while watching
- **So that** I can share reactions with others

**Acceptance Criteria**:
- Can type message in overlay input field
- Press Enter or click Send to submit
- Message appears instantly in chat
- Other users see message within 500ms
- Rate limiting prevents spam (5 messages/10s)
- Character limit prevents overly long messages (300 chars)

---

**Story 5: Stay Synced**
- **As a** viewer
- **I want to** watch at the same timestamp as others
- **So that** we're all seeing the same moment

**Acceptance Criteria**:
- Extension calculates correct timestamp based on show start time
- "Watch Now" button includes timestamp parameter
- If user is >10s out of sync, warning appears
- Can click "Sync Now" to jump to correct time
- Sync status indicator shows "Synced" when correct

---

### 7.3 Discovery & Notifications

**Story 6: Get Notified of Shows**
- **As a** regular user
- **I want to** be notified when shows start
- **So that** I don't miss content I care about

**Acceptance Criteria**:
- Browser notification appears when show starts
- Notification includes show title and thumbnail
- Clicking notification opens YouTube to video
- Can set reminders for upcoming shows
- Notifications respect Do Not Disturb hours

---

**Story 7: Browse Schedule**
- **As a** potential viewer
- **I want to** see what's coming up
- **So that** I can plan to watch later

**Acceptance Criteria**:
- Extension popup shows next 3 upcoming shows
- Each show displays title, thumbnail, start time
- Start time is in user's local timezone
- Countdown timer shows time until next show
- Can click "View Full Schedule" for complete listing

---

### 7.4 Edge Cases

**Story 8: Handle Disconnection**
- **As a** user with unstable internet
- **I want to** automatically reconnect
- **So that** I don't lose chat access

**Acceptance Criteria**:
- WebSocket auto-reconnects on disconnect
- "Reconnecting..." indicator appears during downtime
- Messages are queued and sent on reconnection
- Chat history reloads after reconnect
- No duplicate messages appear

---

**Story 9: Multiple YouTube Tabs**
- **As a** user with multiple YouTube tabs open
- **I want** chat overlay only in the relevant tab
- **So that** it doesn't clutter other videos

**Acceptance Criteria**:
- Only shows overlay on tabs with scheduled video
- Other YouTube tabs show no overlay
- Switching tabs updates which has overlay
- Closing active tab doesn't break chat in other tabs

---

**Story 10: Extension Update**
- **As a** user receiving an extension update
- **I want** seamless transition to new version
- **So that** my experience isn't disrupted

**Acceptance Criteria**:
- Update installs without requiring manual action
- Chat connection persists through update
- User preferences preserved
- No data loss (username, settings)
- Changelog shown in popup (optional)

---

## 8. Development Phases

### Phase 1: Core Extension Setup (Week 1)

**Deliverables**:
- Manifest V3 configuration
- Basic service worker setup
- Content script injection on YouTube
- Extension popup with placeholder UI
- Chrome.storage setup for preferences

**Tasks**:
1. Create extension directory structure
2. Configure manifest.json with permissions
3. Build service worker skeleton (WebSocket stub)
4. Create content script that logs when on YouTube video
5. Build popup HTML/CSS with schedule mockup
6. Test installation and basic injection

**Success Criteria**:
- Extension loads without errors
- Icon appears in toolbar
- Content script console logs appear on YouTube
- Popup opens and displays

---

### Phase 2: Chat System (Week 2)

**Deliverables**:
- WebSocket connection in service worker
- Chat overlay React component
- Message sending/receiving
- Username management
- Basic chat UI on YouTube

**Tasks**:
1. Set up Node.js chat server (Socket.io)
2. Implement WebSocket connection in service worker
3. Build chat overlay React component
4. Create chrome.runtime message passing between content/background
5. Implement chat input, message list, auto-scroll
6. Add username prompt and storage
7. Style overlay to match YouTube

**Success Criteria**:
- Can send messages from extension
- Messages appear for all connected users
- Overlay renders on YouTube video pages
- Username persists across sessions
- No visual conflicts with YouTube UI

---

### Phase 3: Schedule & Video Detection (Week 3)

**Deliverables**:
- Schedule fetching and caching
- Video detection logic
- Current show calculation
- "Watch Now" navigation
- Popup schedule display

**Tasks**:
1. Create schedule JSON and API endpoint
2. Fetch schedule in service worker on startup
3. Cache schedule in chrome.storage.local
4. Detect current video ID in content script
5. Check if video matches schedule
6. Show/hide overlay based on schedule
7. Calculate current timestamp for "Watch Now" button
8. Build popup UI with live show and upcoming
9. Implement navigation to YouTube with timestamp

**Success Criteria**:
- Schedule loads and caches correctly
- Overlay only appears for scheduled videos
- "Watch Now" opens YouTube at correct timestamp
- Popup displays current and upcoming shows accurately
- Timestamps update in real-time

---

### Phase 4: Notifications & Polish (Week 4)

**Deliverables**:
- Browser notifications for show starts
- Extension badge with viewer count
- Settings page
- Sync warning and resync button
- Error handling and reconnection
- UI polish and animations

**Tasks**:
1. Implement browser notifications with chrome.notifications
2. Add reminder system for upcoming shows
3. Update badge with viewer count
4. Create settings page (notification preferences, theme)
5. Add sync detection and warning UI
6. Implement reconnection strategy with exponential backoff
7. Add loading states, error messages
8. Polish animations and transitions
9. Test with 10+ beta users
10. Fix bugs and refine UX

**Success Criteria**:
- Notifications appear when shows start
- Badge shows accurate viewer count
- Settings save and apply correctly
- Sync warning appears when out of sync
- WebSocket reconnects gracefully after disconnect
- Extension feels polished and professional

---

### Phase 5: Testing & Launch (Week 5)

**Deliverables**:
- Comprehensive testing across scenarios
- Chrome Web Store listing
- Documentation
- Launch to initial users

**Tasks**:
1. Test on different screen sizes and resolutions
2. Test with slow/unstable network connections
3. Test with multiple YouTube tabs open
4. Verify all permissions are necessary and working
5. Create promotional images for Chrome Web Store (1280x800, 440x280)
6. Write store description and screenshots
7. Record demo video (optional)
8. Submit to Chrome Web Store for review
9. Create landing page with instructions
10. Prepare social media announcement

**Success Criteria**:
- No critical bugs found in testing
- Extension approved by Chrome Web Store
- Published and publicly available
- 20+ initial installs from beta users
- Average rating >4.0 stars

---

## 9. Chrome Web Store Requirements

### 9.1 Store Listing Assets

**Required**:
- Extension icon (128x128 PNG)
- Small promotional tile (440x280 PNG)
- Marquee promotional tile (1400x560 PNG) - optional but recommended
- At least 1 screenshot (1280x800 or 640x400 PNG)
- Detailed description (max 132 characters summary + unlimited full description)
- Privacy policy URL
- Category selection

**Promotional Images to Create**:
1. **Hero Shot**: Chat overlay on YouTube with active conversation
2. **Schedule View**: Extension popup showing upcoming shows
3. **Notification**: Browser notification when show starts
4. **Community**: Multiple users chatting together (mockup)

**Description Template**:
```
Summary:
Watch YouTube together with friends! Synchronized chat overlay for scheduled shows.

Full Description:
Watch Party Coordinator brings back the magic of communal TV watching. Install the extension, and when scheduled shows are live, a chat overlay appears directly on YouTube. Watch together, chat in real-time, and never scroll alone again.

Features:
✓ Live chat overlay on YouTube videos
✓ Scheduled programming - no more algorithm fatigue
✓ Auto-sync to watch at the same timestamp
✓ Browser notifications when shows start
✓ See who else is watching
✓ Clean, non-intrusive interface

Perfect for:
• Watching live events with friends
• Weekly show viewing parties
• Community content marathons
• Replacing endless scrolling with intentional watching

Privacy-focused: No account required, just pick a username and start chatting.
```

---

### 9.2 Privacy Policy Requirements

**Must Address**:
- What data is collected (username, chat messages)
- How data is stored (chrome.storage, server-side temporarily)
- How data is used (enable chat functionality)
- Data sharing (messages visible to other users)
- Data retention (messages not permanently stored)
- User rights (can change username, clear data)

**Sample Privacy Policy Outline**:
```markdown
# Privacy Policy for Watch Party Coordinator

## Data Collection
We collect minimal data to provide chat functionality:
- Username (chosen by you)
- Chat messages you send
- Video watching activity (which scheduled videos you're on)

## Data Storage
- Username stored locally in your browser (chrome.storage.sync)
- Chat messages stored temporarily on our servers (cleared after 24 hours)
- No personal information or browsing history collected

## Data Sharing
- Your chat messages are visible to all users watching the same video
- We do not sell or share your data with third parties
- No advertising or tracking

## Your Rights
- Change your username anytime
- Messages are ephemeral (not permanently stored)
- Uninstall extension to remove all local data

Questions? Contact: privacy@watchparty.example
```

---

### 9.3 Review Process Expectations

**Timeline**:
- Initial review: 1-3 business days typically
- Possible additional review if flagged: up to 7 days
- Updates (after initial publish): Usually <24 hours

**Common Rejection Reasons**:
- Permissions not justified (explain each in description)
- Unclear value proposition
- Poor quality screenshots
- Missing privacy policy
- Violating YouTube TOS (ensure compliance)

**How to Avoid Rejection**:
- Clearly explain why each permission is needed
- Provide high-quality, realistic screenshots
- Link to privacy policy
- Test thoroughly before submitting
- Include detailed "How to Use" in description

---

## 10. Technical Constraints & Considerations

### 10.1 Chrome Extension Limitations

**Service Worker Lifecycle**:
- Can be terminated after 5 minutes of inactivity
- Must handle unexpected terminations gracefully
- Use chrome.alarms to keep alive if needed
- Reconnect WebSocket on wake

**Content Script Restrictions**:
- Cannot access chrome.* APIs directly (must message service worker)
- Runs in isolated world (separate from page JavaScript)
- Can access DOM but not page variables
- Limited by CSP of host page

**Storage Limits**:
- chrome.storage.sync: 100KB total, 8KB per item
- chrome.storage.local: 10MB total
- chrome.storage.session: 10MB total
- Exceeding limits throws errors

**Network Restrictions**:
- CORS applies to fetch requests
- WebSocket connections work from service worker
- No persistent HTTP connections from content scripts

---

### 10.2 YouTube-Specific Challenges

**YouTube UI Changes**:
- YouTube frequently updates UI without notice
- Selectors for video element may break
- Must use resilient selectors (e.g., `document.querySelector('video')`)
- Have fallback detection methods

**YouTube Experiments**:
- YouTube A/B tests different UIs
- Some users see different layouts
- Test overlay positioning on multiple accounts

**YouTube Policies**:
- Ensure we're not violating ToS
- Don't interfere with ads (critical for creator revenue)
- Don't modify video playback without user action
- Clearly attribute content to YouTube

**SPAs (Single Page Application)**:
- YouTube doesn't reload on navigation
- Must use MutationObserver to detect video changes
- Clean up event listeners to prevent memory leaks

```javascript
// Detect YouTube navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    onYouTubeNavigate(currentUrl);
  }
}).observe(document, { subtree: true, childList: true });
```

---

### 10.3 Performance Optimization

**Minimize Content Script Overhead**:
- Lazy load React only when chat overlay needed
- Use lightweight DOM manipulation for simple tasks
- Debounce frequent operations (scroll, timestamp checks)
- Remove event listeners when overlay hidden

**Reduce Service Worker Wake-Ups**:
- Batch operations where possible
- Use chrome.alarms instead of setInterval
- Cache aggressively to reduce network requests

**Optimize Chat Rendering**:
- Virtual scrolling for message list (only render visible messages)
- React.memo for message components
- Batch message updates (don't re-render per message)

**Memory Management**:
- Limit chat history to last 200 messages
- Clear old cached data periodically
- Unsubscribe from events when overlay closed

---

## 11. Security & Privacy

### 11.1 Input Sanitization

**Chat Messages**:
```javascript
import DOMPurify from 'dompurify';

function sanitizeMessage(message) {
  // Remove HTML tags
  const clean = DOMPurify.sanitize(message, { 
    ALLOWED_TAGS: [], 
    ALLOWED_ATTR: [] 
  });
  
  // Limit length
  return clean.slice(0, 300);
}
```

**Username Validation**:
```javascript
function validateUsername(username) {
  // 3-20 chars, alphanumeric + underscores only
  const regex = /^[a-zA-Z0-9_]{3,20}$/;
  return regex.test(username);
}
```

---

### 11.2 Rate Limiting

**Client-Side** (in content script):
```javascript
const messageQueue = [];
const RATE_LIMIT = 5; // messages
const RATE_WINDOW = 10000; // 10 seconds

function canSendMessage() {
  const now = Date.now();
  const recentMessages = messageQueue.filter(t => now - t < RATE_WINDOW);
  messageQueue = recentMessages;
  
  if (recentMessages.length >= RATE_LIMIT) {
    return false;
  }
  
  messageQueue.push(now);
  return true;
}
```

**Server-Side** (in chat server):
- Track messages per user ID per time window
- Reject excess messages with error response
- Temporary ban after repeated violations (10 min)

---

### 11.3 Data Privacy

**No PII Collection**:
- Don't collect email, real names, or browsing history
- Username is pseudonymous (not verified)
- No analytics tracking of personal data

**Message Retention**:
- Messages deleted from server after 24 hours
- Not stored in permanent database in MVP
- Users informed messages are public and ephemeral

**Chrome Storage**:
- All data stored locally in user's browser
- chrome.storage.sync syncs across user's devices only (not shared with us)
- Uninstalling extension clears all local data

---

## 12. Analytics & Metrics

### 12.1 Tracking (Privacy-Conscious)

**What to Track**:
- Extension installs (Chrome Web Store provides this)
- Daily active users (anonymous count)
- Messages sent per day
- Shows watched (by show ID, not user ID)
- Average session duration
- Click-through rate on "Watch Now"

**What NOT to Track**:
- Individual user behavior patterns
- Message content
- Video watching beyond scheduled shows
- Any personally identifiable information

**Implementation**:
- Use privacy-focused analytics (Plausible or self-hosted)
- Aggregate data only, no user-level tracking
- Make analytics opt-in or clearly disclosed

```javascript
// Example: Track show view (anonymously)
fetch('https://analytics.watchparty.example/event', {
  method: 'POST',
  body: JSON.stringify({
    event: 'show_viewed',
    showId: 'show_001',
    timestamp: Date.now()
    // No user ID or identifying info
  })
});
```

---

### 12.2 Success Metrics (Post-Launch)

**Week 1**:
- 100+ installs
- 20+ DAU
- 10+ messages per day

**Month 1**:
- 500+ installs
- 100+ DAU
- 500+ messages per day
- 4.0+ star rating

**Month 3**:
- 2,000+ installs
- 400+ DAU
- 20+ concurrent viewers during peak shows
- Organic growth (word of mouth, not just initial push)

---

## 13. Out of Scope (Post-MVP)

**Deferred Features**:
- User accounts/authentication
- Private watch parties (invite-only)
- Multiple channels
- User-submitted schedules
- In-extension video player
- Reactions/emojis
- Threaded conversations
- Direct messages between users
- Moderator tools (kick/ban)
- Custom themes
- Mobile app
- Browser extension for Firefox/Safari
- Integration with other video platforms (Vimeo, Twitch)
- Monetization (premium features, donations)

---

## 14. Launch Strategy

### 14.1 Pre-Launch (2 Weeks Before)

**Tasks**:
- Recruit 20 beta testers from target community
- Create landing page with explainer video
- Prepare social media content (Twitter, Reddit posts)
- Reach out to YouTube creators for potential partnerships
- Build email list for launch announcement

**Beta Testing Goals**:
- Find and fix critical bugs
- Validate that chat works with 10+ concurrent users
- Gather feedback on UI/UX
- Test on different computers/setups

---

### 14.2 Launch Day

**Timeline**:
1. **9:00 AM**: Submit to Chrome Web Store (if not already approved)
2. **10:00 AM**: Tweet announcement with demo video
3. **10:30 AM**: Post on relevant subreddits (r/youtube, r/webdev, niche communities)
4. **11:00 AM**: Product Hunt submission (optional)
5. **Throughout day**: Monitor installs, respond to feedback, fix urgent bugs
6. **8:00 PM**: Host first official watch party with all users

**Content to Prepare**:
- Demo video (2-3 minutes showing installation and usage)
- Twitter thread explaining problem and solution
- Reddit post with clear value proposition
- Discord/Slack message for communities
- Email to beta testers and waitlist

---

### 14.3 Post-Launch (Week 1)

**Daily Tasks**:
- Monitor Chrome Web Store reviews, respond within 24 hours
- Check error logs for crashes or bugs
- Track analytics (installs, DAU, messages sent)
- Engage with users on social media
- Fix critical bugs immediately, minor bugs within 48 hours

**Week 1 Goals**:
- Achieve 100+ installs
- Maintain 4.0+ star rating
- No critical bugs reported
- At least 1 successful watch party with 10+ people

---

## 15. Maintenance & Updates

### 15.1 Regular Maintenance

**Weekly**:
- Review and respond to Chrome Web Store reviews
- Monitor error logs
- Check for YouTube UI changes that break overlay
- Update schedule for next week

**Monthly**:
- Analyze usage metrics
- Plan feature prioritization
- Update dependencies (security patches)
- Test extension on latest Chrome version

**Quarterly**:
- Review and update privacy policy if needed
- Evaluate server costs and optimize
- User survey for feature requests
- Consider expanding to new platforms

---

### 15.2 Version Update Process

**Minor Updates** (bug fixes, small improvements):
1. Fix in development branch
2. Test locally
3. Update version in manifest (e.g., 1.0.0 → 1.0.1)
4. Submit to Chrome Web Store
5. Usually approved within 24 hours
6. Auto-updates to users within 48 hours

**Major Updates** (new features):
1. Develop and test thoroughly
2. Beta test with subset of users
3. Update version (e.g., 1.0.0 → 1.1.0)
4. Create changelog
5. Submit to store
6. Announce update on social media

---

## 16. Budget & Resources

### 16.1 Development Costs

**One-Time**:
- Chrome Web Store developer fee: $5
- Domain name (optional): $12/year
- Design tools (Figma, if not using free tier): $0-15/month
- **Total One-Time**: ~$5-20

**Monthly Recurring**:
- Backend hosting (Railway/Render): $5-10
- Database (if needed beyond MVP): $0 (free tier)
- Domain renewal: ~$1/month
- Analytics (if using paid): $0 (free tier)
- **Total Monthly**: ~$5-10

**MVP Budget**: $50-100 for first 3 months

---

### 16.2 Time Investment

**Solo Developer**:
- Week 1: Extension setup (20 hours)
- Week 2: Chat system (25 hours)
- Week 3: Schedule & detection (20 hours)
- Week 4: Notifications & polish (25 hours)
- Week 5: Testing & launch (15 hours)
- **Total**: ~105 hours (roughly 2.5 months part-time)

**Team (2 developers)**:
- Frontend dev: Weeks 1-4 (80 hours)
- Backend dev: Weeks 2-4 (60 hours)
- **Total**: 4-5 weeks calendar time

---

## 17. Risk Assessment

### 17.1 Critical Risks

**Risk: Chrome Web Store Rejection**
- **Probability**: Medium
- **Impact**: High (blocks launch)
- **Mitigation**: 
  - Follow all guidelines carefully
  - Test on multiple machines before submitting
  - Have clear privacy policy and permission explanations
  - Submit early to allow time for resubmission if needed

**Risk: YouTube Policy Violation**
- **Probability**: Low
- **Impact**: Critical (extension could be banned)
- **Mitigation**:
  - Don't interfere with ads or video playback
  - Use official YouTube embeds/links only
  - Clearly attribute content to YouTube
  - Monitor YouTube's ToS for changes

**Risk: Low User Adoption**
- **Probability**: High (common for new extensions)
- **Impact**: Medium (affects growth but not functionality)
- **Mitigation**:
  - Focus on specific niche first (anime, retro TV, etc.)
  - Partner with YouTube creators for promotion
  - Seed initial watch parties with friends
  - Make onboarding extremely simple

---

### 17.2 Technical Risks

**Risk: Service Worker Termination**
- **Probability**: High (expected behavior)
- **Impact**: Medium (WebSocket disconnects)
- **Mitigation**:
  - Implement robust reconnection logic
  - Use chrome.alarms to keep alive
  - Queue messages during disconnect
  - Clear user communication about connection state

**Risk: YouTube UI Changes**
- **Probability**: High (YouTube updates frequently)
- **Impact**: Medium (overlay may break)
- **Mitigation**:
  - Use resilient selectors (generic video element)
  - Monitor YouTube updates
  - Have automated tests that detect breaks
  - Build flexible layout that adapts to changes

**Risk: Scaling Issues**
- **Probability**: Low (only if very successful)
- **Impact**: High (chat server overload)
- **Mitigation**:
  - Start with cheap server, monitor usage
  - Plan scaling strategy (add servers, load balancer)
  - Set user caps initially (e.g., max 500 concurrent)
  - Use serverless options for WebSocket (AWS API Gateway + Lambda) if needed

---

## 18. Support & Documentation

### 18.1 User Documentation

**In-Extension Help**:
- First-run tutorial (overlay explaining features)
- Tooltip on each UI element
- Settings page with explanations
- "How to Use" link in popup

**External Documentation**:
- Landing page with FAQ
- Video tutorial on YouTube
- Written guide with screenshots
- Troubleshooting common issues

**Common Questions to Address**:
- "Why doesn't the chat appear?" → Check if video is scheduled
- "How do I change my username?" → Click current username in overlay
- "Why am I out of sync?" → Click "Sync Now" button
- "Can I watch on mobile?" → Not yet, desktop Chrome only for MVP

---

### 18.2 User Support Channels

**Chrome Web Store Reviews**:
- Respond to every review within 48 hours
- Address bugs mentioned in reviews
- Thank positive reviewers

**Email Support** (optional):
- Create support@watchparty.example email
- Respond within 24-48 hours
- Keep responses friendly and helpful

**Discord/Community** (if building community):
- Create Discord server for users
- Share schedule updates
- Gather feature requests
- Organize watch parties

---

## 19. Legal & Compliance

### 19.1 Terms of Service

**Must Include**:
- Acceptable use policy (no spam, harassment)
- Content guidelines for chat
- Right to ban users violating terms
- Disclaimer about service availability
- Limitation of liability

**Sample ToS Points**:
```
By using Watch Party Coordinator, you agree to:
- Be respectful in chat (no harassment, hate speech)
- Not spam or abuse the service
- Not attempt to break or exploit the extension

We reserve the right to:
- Modify or discontinue the service at any time
- Ban users who violate these terms
- Change these terms with notice

Disclaimer:
- Service provided "as is" without warranty
- We are not responsible for YouTube content
- We are not liable for chat content from other users
```

---

### 19.2 GDPR Compliance (if applicable)

**If You Have EU Users**:
- Allow users to export their data (just username in MVP)
- Allow users to delete their data
- Provide clear privacy policy
- Get consent for analytics tracking

**Implementation**:
- "Delete my data" button in settings (clears chrome.storage)
- Privacy policy linked in Chrome Web Store
- Analytics opt-in checkbox (or make opt-out)

---

## 20. Success Indicators & Next Steps

### 20.1 How to Know If MVP is Successful

**Quantitative Metrics** (Month 1):
- ✅ 500+ installs
- ✅ 100+ DAU
- ✅ 10+ concurrent viewers during peak show
- ✅ 4.0+ star rating on Chrome Web Store
- ✅ 50+ messages per day

**Qualitative Indicators**:
- ✅ Positive reviews mentioning "felt like watching together"
- ✅ Users requesting specific shows to be scheduled
- ✅ Organic growth (users inviting friends)
- ✅ Community forming around watch parties
- ✅ Low uninstall rate (<20% after 1 week)

---

### 20.2 Next Steps After MVP

**If Successful, Prioritize**:
1. User-submitted schedules (let community curate)
2. Multiple channels (different content niches)
3. Private watch parties (invite friends to watch any video together)
4. Firefox extension (expand browser support)
5. Moderator tools (for managing chat)

**If Struggling, Consider**:
1. Pivot to private watch parties only (easier to market)
2. Focus on one specific niche (e.g., anime community only)
3. Partner with YouTube creators for exclusive watch parties
4. Add unique features (polls during shows, reactions)

---

## 21. Appendices

### 21.1 Sample Code Snippets

**Service Worker WebSocket Connection**:
```javascript
// background/service-worker.js
let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;

function connectWebSocket() {
  ws = new WebSocket('wss://chat.watchparty.example/ws');
  
  ws.onopen = () => {
    console.log('WebSocket connected');
    reconnectAttempts = 0;
    // Authenticate
    ws.send(JSON.stringify({
      type: 'auth',
      userId: await getUserId()
    }));
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    // Forward to content scripts
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'CHAT_MESSAGE',
          data: data
        });
      });
    });
  };
  
  ws.onclose = () => {
    console.log('WebSocket closed, reconnecting...');
    reconnect();
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function reconnect() {
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;
  
  setTimeout(() => {
    connectWebSocket();
  }, delay);
}

// Initialize on startup
connectWebSocket();

// Keep service worker alive
chrome.alarms.create('keepAlive', { periodInMinutes: 4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reconnect();
    }
  }
});
```

**Content Script Chat Overlay Injection**:
```javascript
// content/content-script.js
function injectChatOverlay() {
  // Check if already injected
  if (document.getElementById('watch-party-root')) return;
  
  // Create container
  const container = document.createElement('div');
  container.id = 'watch-party-root';
  document.body.appendChild(container);
  
  // Use shadow DOM for style isolation
  const shadowRoot = container.attachShadow({ mode: 'open' });
  
  // Inject styles
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    .chat-overlay {
      position: fixed;
      top: 56px;
      right: 0;
      width: 350px;
      height: calc(100vh - 56px);
      background: rgba(15, 15, 15, 0.95);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      border-left: 1px solid #303030;
    }
  `;
  shadowRoot.appendChild(styleSheet);
  
  // Create React root
  const appRoot = document.createElement('div');
  shadowRoot.appendChild(appRoot);
  
  // Render React component
  import('./chat-overlay.jsx').then(({ ChatOverlay }) => {
    ReactDOM.createRoot(appRoot).render(<ChatOverlay />);
  });
}

// Detect if on YouTube video page
function isVideoPage() {
  return /^\/watch\?v=/.test(location.pathname + location.search);
}

// Check if video is scheduled
async function checkIfScheduled() {
  const urlParams = new URLSearchParams(location.search);
  const videoId = urlParams.get('v');
  
  const response = await chrome.runtime.sendMessage({
    type: 'CHECK_SCHEDULED',
    videoId: videoId
  });
  
  if (response.isScheduled) {
    injectChatOverlay();
  }
}

// Initialize
if (isVideoPage()) {
  checkIfScheduled();
}

// Listen for YouTube navigation (SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    if (isVideoPage()) {
      checkIfScheduled();
    }
  }
}).observe(document, { subtree: true, childList: true });
```

---

### 21.2 Tech Stack Summary

**Frontend (Extension)**:
- Manifest V3
- React 18 (for chat overlay and popup)
- Tailwind CSS (for styling)
- Socket.io-client (WebSocket)
- DOMPurify (sanitization)

**Backend**:
- Node.js 18+
- Express.js (REST API)
- Socket.io (WebSocket server)
- JSON file storage (MVP)
- PostgreSQL (post-MVP)

**Hosting**:
- Extension: Chrome Web Store
- Backend: Railway/Render ($5-10/month)
- Database: Supabase free tier or Railway Postgres

**DevTools**:
- Vite (build tool)
- ESLint + Prettier (code quality)
- Jest (testing)
- Chrome Extension CLI tools

---

### 21.3 Estimated Timeline

**Total: 5-6 Weeks**

| Week | Focus | Hours | Deliverable |
|------|-------|-------|-------------|
| 1 | Extension setup | 20 | Working extension scaffold |
| 2 | Chat system | 25 | Live chat functional |
| 3 | Schedule/detection | 20 | Auto-detects scheduled videos |
| 4 | Notifications/polish | 25 | Full feature set complete |
| 5 | Testing/launch | 15 | Published on Chrome Web Store |

**Part-time (10-15 hrs/week)**: 2-3 months  
**Full-time (40 hrs/week)**: 1 month

---

## 22. Final Checklist

### Pre-Development
- [ ] Confirm Chrome Web Store developer account ($5 fee paid)
- [ ] Design mockups approved
- [ ] Tech stack decided
- [ ] Backend hosting chosen
- [ ] Privacy policy drafted

### Development
- [ ] Extension manifest configured
- [ ] Service worker with WebSocket working
- [ ] Content script injects on YouTube
- [ ] Chat overlay renders correctly
- [ ] Schedule fetching and caching working
- [ ] Video detection logic functional
- [ ] Notifications implemented
- [ ] Settings page created
- [ ] All features tested locally

### Pre-Launch
- [ ] Beta tested with 10+ users
- [ ] All critical bugs fixed
- [ ] Chrome Web Store listing prepared
- [ ] Promotional images created (440x280, 1400x560)
- [ ] Screenshots captured (at least 1)
- [ ] Privacy policy published
- [ ] Landing page created (optional)
- [ ] Social media content prepared

### Launch
- [ ] Submitted to Chrome Web Store
- [ ] Approved and published
- [ ] Announced on social media
- [ ] Posted on relevant communities
- [ ] Monitoring reviews and feedback
- [ ] Error logging active

### Post-Launch
- [ ] Responding to reviews daily
- [ ] Tracking analytics
- [ ] Planning next iteration
- [ ] Community engagement ongoing

---

**Document Version**: 2.0 (Chrome Extension Focus)  
**Last Updated**: January 24, 2026  
**Owner**: Product Team  
**Target**: Chrome Extension MVP in 5-6 weeks