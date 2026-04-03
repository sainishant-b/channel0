# Channel0 - Watch Party Coordinator

Channel0 is a full-stack watch-party platform built around a Chrome extension that overlays synchronized live chat directly on YouTube. It recreates shared TV-style viewing by combining scheduled programming, real-time messaging, and automatic timestamp sync.

## Why This Project

Most video consumption is isolated. Channel0 brings back community viewing by letting users watch the same YouTube content at the same time and chat without leaving the player page.

## Key Features

- Real-time chat overlay injected into YouTube pages (content script + React UI).
- Schedule-driven watch sessions with "Now Playing" and upcoming timeline.
- Timestamp synchronization so users join at the correct point in a live session.
- Instant "Watch Now" navigation into the active scheduled video.
- Preemptive next-video loading to reduce transition delay and avoid autoplay conflicts.
- Extension badge and browser notifications for live/upcoming shows.
- Dynamic queue management with admin controls and playlist import support.
- Backend WebSocket rooms for low-latency, multi-user chat sessions.

## System Architecture

### Client (Chrome Extension)

- Manifest V3 extension with service worker background runtime.
- YouTube content script for detection, overlay injection, and playback hooks.
- Popup UI for schedule visibility and quick navigation.
- Options page for user preferences.

### Server (Node.js + Socket.io)

- REST endpoints for schedule/chat metadata.
- WebSocket server for live messaging and session coordination.
- Schedule and queue services for show progression logic.

## Tech Stack

- Frontend/Extension: TypeScript, React, Vite, Manifest V3, Chrome Extensions API
- Realtime: Socket.io (client + server)
- Backend: Node.js, Express, TypeScript
- Utilities/Security: DOMPurify for chat sanitization

## Repository Structure

```text
channel0/
├── watch-party-extension/   # Chrome extension (popup, content script, background)
├── server/                  # Node.js + Socket.io backend
├── ui-showcase/             # UI prototypes/showcase assets
├── watch_party_prd.md       # Product requirements
├── IMPLEMENTATION_PLAN.md   # Build roadmap
├── PHASE2.md                # Phase progress + remaining items
└── TESTING_GUIDE.md         # Manual test workflows
```

## Local Setup

### 1) Start Backend Server

```bash
cd server
npm install
npm run dev
```

Server runs on `http://localhost:3001` by default.

### 2) Build Extension

```bash
cd watch-party-extension
npm install
npm run build
```

### 3) Load Extension in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `watch-party-extension/dist`

### 4) Use the Product

1. Open the extension popup to view schedule.
2. Click **Watch Now** during live content.
3. Chat in the YouTube overlay with other viewers.
4. Use admin panel (`/admin`) for queue/video management.

## Development Notes

- Shared types and constants are under `watch-party-extension/src/shared`.
- Background-service and content-script message passing drives sync behavior.
- The backend schedule service controls queue order and auto-advance behavior.

## Future Improvements

- Automated unit/integration test coverage.
- Production deployment and observability.
- Chrome Web Store listing polish and release checklist.

## Resume-Friendly Summary

Built a full-stack Chrome extension that overlays synchronized live chat on YouTube, with schedule-aware navigation, timestamp alignment, preemptive next-video loading, and a Socket.io backend for real-time multi-user watch sessions.
