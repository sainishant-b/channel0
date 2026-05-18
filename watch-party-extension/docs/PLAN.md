# Watch Party — Product Plan

> Living document. Update as decisions land or scope shifts.

## 1. Vision

A Chrome extension that turns YouTube into traditional TV-style channels. A host curates a playlist (public or private), names it as a channel, and broadcasts to viewers who join via a short code. Playback stays in sync across viewers using a server-derived clock. The playlist can be edited live. Viewers watch on the actual youtube.com page, so creator view counts are preserved.

### Use cases
- Themed channels (e.g. "Nature Channel" with curated wildlife videos)
- Reaction creators reclaiming view counts that would otherwise go to a second-screen platform
- Friends watching together asynchronously across timezones (drop in mid-broadcast)

## 2. Locked decisions

| # | Decision |
|---|----------|
| Sync model | Hybrid — server-derived channel clock; host can pause/seek/skip |
| Late join | Jump to current `channelTime` |
| Hosts per channel | Single host (v1) |
| Playlist edits during broadcast | Allowed (add / reorder / remove) |
| Channel lifecycle | Manual start / pause / stop by host |
| Discovery | Code-based only (v1); browse later |
| Chat | Ephemeral — wiped when host stops broadcast |
| Live YouTube streams | Not supported (v1, VOD only) |
| Auth | Anonymous + Google sign-in both supported |
| Backend | Appwrite |
| Ad handling | Option A — snap to `channelTime` on ad-end (per-client detection) |
| Video duration source | Read `video.duration` on host's content script when video first plays; write to playlist item |
| Host disconnect during broadcast | Any viewer's `video.ended` triggers advance (optimistic concurrency). On stop, broadcast a "stopped by host" message in chat overlay |
| Appwrite OAuth callback | OK — use `chrome-extension://<ID>/callback.html` redirect |
| T4 Auth path | B — Appwrite OAuth via `chrome.identity.launchWebAuthFlow` |
| Build order | Approved per §11 |

## 3. Open decisions

- Awaiting Appwrite project creation by user (endpoint URL + project ID) before T1 can complete.

## 4. Architecture

```
[Chrome extension]
  ├─ popup (React)        host UI: create channel, manage playlist, browse own
  ├─ content-script       overlay + sync engine + ad observer (runs on youtube.com/watch)
  └─ service-worker       Appwrite SDK, realtime subs, message bus, alarms

[Appwrite cloud]
  ├─ Account              anonymous + Google OAuth
  ├─ Databases            channels, playlist_items, chat_messages, presence
  ├─ Realtime             doc subscriptions
  └─ Functions            channel-cleanup-on-stop, presence-ttl-sweeper
```

## 5. Data model

### `channels`
| Field | Type | Notes |
|-------|------|-------|
| `$id` | string | Appwrite doc id |
| `code` | string | 6-char unique, alphanumeric, no ambiguous chars |
| `name` | string | host-set |
| `description` | string? | optional |
| `visibility` | enum | `public` \| `private` |
| `hostUserId` | string | Appwrite user id |
| `state` | enum | `playing` \| `paused` \| `stopped` |
| `currentVideoIndex` | number | index into ordered playlist |
| `currentVideoStartedAt` | datetime? | set on play / skip / advance |
| `pauseAccumMs` | number | total paused time within current video |
| `pausedAt` | datetime? | non-null while paused |
| `viewerCount` | number | derived from presence sweep |
| `createdAt` | datetime | |

Index: `code` unique.

### `playlist_items`
| Field | Type |
|-------|------|
| `$id` | string |
| `channelId` | string (FK) |
| `position` | number |
| `videoId` | string |
| `videoTitle` | string |
| `videoDuration` | number? (seconds, populated on first play) |
| `addedAt` | datetime |

Index: `channelId+position`.

### `chat_messages`
| Field | Type |
|-------|------|
| `$id` | string |
| `channelId` | string (FK) |
| `userId` | string |
| `username` | string |
| `text` | string (≤300 chars) |
| `createdAt` | datetime |

Index: `channelId+createdAt`.

### `presence`
| Field | Type |
|-------|------|
| `$id` | string |
| `channelId` | string (FK) |
| `userId` | string |
| `lastPing` | datetime |

Sweeper Function deletes rows where `lastPing < now - 60s`. Heartbeat every 20s from each viewer.

## 6. Sync engine — computed clock

Channel doc holds the timeline anchors. Each client computes `channelTime` locally:

```ts
function channelTime(ch): number {
  if (ch.state === 'stopped') return 0;
  const ref = ch.state === 'paused'
    ? +new Date(ch.pausedAt!)
    : Date.now();
  return (ref - +new Date(ch.currentVideoStartedAt!) - ch.pauseAccumMs) / 1000;
}
```

### Host actions and the writes they perform

| Action | Updates |
|--------|---------|
| Start broadcast | `state='playing'`, `currentVideoIndex=0`, `currentVideoStartedAt=now`, `pauseAccumMs=0`, `pausedAt=null` |
| Pause | `state='paused'`, `pausedAt=now` |
| Resume | `pauseAccumMs += now - pausedAt`, `state='playing'`, `pausedAt=null` |
| Skip / advance | `currentVideoIndex+=1`, `currentVideoStartedAt=now`, `pauseAccumMs=0`, `pausedAt=null` |
| Stop | `state='stopped'`, post system chat message ("Broadcast stopped by host"), trigger cleanup Function |

### Viewer drift correction

Run every 1s while `state='playing'` and not in an ad:

```
drift = video.currentTime - channelTime
if (Math.abs(drift) > 5) video.currentTime = channelTime    // hard snap
else if (Math.abs(drift) > 1) adjust playbackRate slightly  // soft catch-up
```

## 7. Ad handling — Option A (snap-after-ad)

Per-client `MutationObserver` on `#movie_player` watches for the `ad-showing` / `ad-interrupting` classes.

```ts
const player = document.querySelector('#movie_player');
const isAd = () =>
  player?.classList.contains('ad-showing') ||
  player?.classList.contains('ad-interrupting') ||
  !!document.querySelector('.video-ads .ytp-ad-player-overlay');
```

While `isAd()` is true, the drift loop pauses. When the ad ends, hard-snap `video.currentTime = channelTime`. Viewer loses content equal to their personal ad duration; everyone re-converges. Premium users experience smooth follow.

## 8. Auth flow

Path B (locked):

1. On first install → `account.createAnonymousSession()` → user has an Appwrite identity
2. Popup "Sign in with Google" → `chrome.identity.launchWebAuthFlow` → Appwrite OAuth2 endpoint → redirect to `chrome-extension://<ID>/callback.html` → session cookie captured → upgrades anonymous user
3. Username display: signed-in users use their Google first name; anonymous users get `Guest_xxxx` and can rename

## 9. Milestones and tickets

Status legend: ✅ done · 🔄 keep + adapt · 🆕 new build · 🗑 rip out

### M1 — Foundation
| ID | Status | Description |
|----|--------|-------------|
| T1 | ✅ | Appwrite project + collections + indexes provisioned via `scripts/appwrite/provision.sh`. Endpoint `https://nyc.cloud.appwrite.io/v1`, project `69ae7d60001c0117191e`, database `69f977a80001f12a0a6f`. Web platform `chrome-extension://iliggmmddgmioogjmomicbdgnnhlkked` registered. |
| T2 | ✅ | Replaced `api-client.ts` and `websocket-client.ts` with Appwrite SDK wrappers. `socket.io-client` removed, `appwrite ^14` added |
| T3 | ✅ | Stripped channel0-style scheduled-show code (`schedule-manager.ts`, `notification-manager.ts`, schedule alarms/handlers, `Show` types) |
| T4 | 🔄 | Auth: anonymous on install + Google OAuth via `chrome.identity.launchWebAuthFlow`. Wire-up complete; needs end-to-end test once unpacked extension is loaded |

### M2 — Channels and playlists
| ID | Status | Description |
|----|--------|-------------|
| T5 | ✅ | Popup view: create channel (name, public/private). HostView wired to HOST_CHANNEL with visibility |
| T6 | ✅ | Popup view: paste YT URL → fetch oEmbed title → append to playlist (PlaylistEditor.tsx) |
| T7 | ✅ | Popup view: reorder (up/down) + delete playlist items (PlaylistEditor.tsx) |
| T8 | ✅ | Popup view: my-channels list with playlist/open/delete (MyChannels.tsx). Open uses `ENTER_CHANNEL` to re-attach session as host without code lookup. |
| T9 | ✅ | 6-char code generator with uniqueness check (`findUniqueChannelCode` in api-client.ts) |

### M3 — Broadcast lifecycle (host)
| ID | Status | Description |
|----|--------|-------------|
| T10 | ✅ | Start broadcast (START_BROADCAST handler + SessionView control) |
| T11 | ✅ | Pause / resume (PAUSE_BROADCAST + RESUME_BROADCAST handlers + controls) |
| T12 | ✅ | Skip current video (SKIP_VIDEO handler + control) |
| T13 | ✅ | Stop broadcast (STOP_BROADCAST handler — posts system chat then sets state=stopped). Cleanup Function deferred to T15 |
| T14 | 🔄 | Auto-advance on `video.ended`. Listener exists in content-script; calls VIDEO_ENDED → `appwriteClient.advanceChannel` with best-effort guard. Server-side atomicity deferred to T15 Function |
| T15 | 🆕 | Appwrite Function: on channel `state` → `stopped`, batch-delete `chat_messages` where `channelId=X`. Also exposes atomic advance-channel HTTP endpoint |

### M4 — Sync engine (viewer)
| ID | Status | Description |
|----|--------|-------------|
| T16 | ✅ | Subscribe to channel doc on join → service-worker enriches with `currentVideoId` then forwards CHANNEL_UPDATE to content script |
| T17 | ✅ | Late-join nav implemented in `onChannelUpdate` → `window.location.href` with `&t=channelTime` |
| T18 | ✅ | Drift loop in content-script `driftTick` (1s, hard snap > 5s, soft playbackRate nudge 1–5s) |
| T19 | ✅ | `currentVideoIndex` change navigates via the same expectedVideoId branch |

### M5 — Ads
| ID | Status | Description |
|----|--------|-------------|
| T20 | ✅ | `MutationObserver` on `#movie_player` (`setupAdObserver`) |
| T21 | ✅ | `inAd` short-circuits drift loop in `driftTick` |
| T22 | ✅ | Hard snap `video.currentTime = channelTime` in `onAdEnd` |

### M6 — Chat (ephemeral)
| ID | Status | Description |
|----|--------|-------------|
| T23 | ✅ | SEND_CHAT → `appwriteClient.sendChatMessage` (service-worker `handleSendChat`) |
| T24 | ✅ | Realtime sub on chat collection in `RealtimeClient`, filtered by channelId |
| T25 | ✅ | Wipe — `appwriteClient.wipeChat` called from `handleStopBroadcast` (replaces deferred T15 Function for v1 ship; revisit if abuse becomes a concern) |

### M7 — Presence (viewer count)
| ID | Status | Description |
|----|--------|-------------|
| T26 | ✅ | Heartbeat alarm (20 s) + `sweepStalePresence` alarm (60 s) in service worker. `appwriteClient.countPresence` re-reads on every realtime presence event. Server-side sweeper Function deferred. |

### M8 — Polish and ship
| ID | Status | Description |
|----|--------|-------------|
| T27 | ✅ | Realtime status (`connecting` / `connected` / `reconnecting` / `disconnected`) surfaced via `onStatusChange` → service-worker forwards `CONNECTION_STATUS` to overlay |
| T28 | ✅ | Anonymous Appwrite session on install + `Guest_xxxx` display name fallback. Google OAuth flow upgrades the anon user |
| T29 | ✅ | `docs/PRIVACY.md` + `docs/TERMS.md` written, linked from Options "About" |
| T30 | ✅ | `scripts/package.mjs` builds + zips into `dist-package/watch-party-vX.Y.Z.zip` via PowerShell on Windows, `zip` elsewhere. `npm run package` |
| T31 | 🆕 | Test matrix: ad/no-ad, Premium/free, late-join, host-disconnect, network flake — deferred to manual QA after first unpacked load |

## 10. Files to delete or gut

### Delete outright
- `src/background/schedule-manager.ts`
- `src/popup/NowPlaying.tsx`
- `src/popup/ScheduleList.tsx`
- `src/background/notification-manager.ts` (no scheduled show notifs in v1)

### Gut and rewrite
- `src/shared/api-client.ts` — replace REST methods with Appwrite SDK
- `src/background/websocket-client.ts` — replace socket.io with Appwrite Realtime subscriber
- `src/shared/message-types.ts` — drop schedule types, add channel-management types

### Keep as-is or with light adaptation
- Vite + crxjs build pipeline
- Manifest v3 (drop `notifications` permission once reminders ripped; keep `identity`, `storage`, `tabs`, `alarms`)
- Shadow DOM overlay rendering
- `MutationObserver` for YouTube SPA navigation
- `escapeHtml` + DOMPurify pipeline (added during fix pass)
- "Watch Party" button injection on YouTube page
- Username validation, settings, options page (trim notification settings)

## 11. Build order

| Step | Days | What |
|------|------|------|
| Spike | 0.5 | Confirm Appwrite OAuth callback works in extension |
| M1 | 1–2 | Rip + replace foundation |
| M2 | 2–3 | Channel and playlist UI |
| M3 | 1–2 | Lifecycle host actions |
| M4 | 2 | Sync engine |
| M5 | 1 | Ads |
| M6 | 1 | Chat swap |
| M7 | 1 | Presence |
| M8 | 2–3 | Polish + ship |

Total ~2 weeks solo.

## 11.1 Appwrite provisioning artefacts

- `scripts/appwrite/provision.sh` — idempotency-free script that creates all 4 collections, 27 attributes, and 7 indexes via Appwrite REST. Run once against an empty database.
- `.appwrite-key.example` — committed template for credentials.
- `.appwrite-key` — gitignored real credentials. Source for `provision.sh` and any future maintenance scripts.
- `.mcp.json` — gitignored MCP server config for the Appwrite MCP. Used to drive future schema or data ops without bash scripts.

If the schema needs to evolve later, prefer adding a numbered migration script (`scripts/appwrite/migrate-001-*.sh`) rather than editing `provision.sh`, so existing databases can pick up only the deltas.

## 12. Recently completed (pre-M1 cleanup pass)

- Fixed XSS holes in overlay innerHTML (escape `showTitle`, `username`, avatar char, `displayUsername`)
- Wired DOMPurify on every `innerHTML` write as defense-in-depth
- Fixed `getDisplayName` return type (was `null as unknown as string`, now `Promise<string | null>`)
- Wired server-validated channel join via `apiClient.resolveChannel(code)` and `apiClient.createChannel(...)` (placeholder REST endpoints — will be replaced by Appwrite SDK in T2)
- Removed unused storage helpers: `getCachedSchedule`, `setCachedSchedule`, `saveChatHistory`, `getChatHistory`
- Removed dead `STORAGE_KEYS` entries (`SCHEDULE_CACHE`, `SCHEDULE_LAST_FETCH`, `CHAT_HISTORY`)

## 13. Appwrite project bootstrap

These steps must be completed once before T1 closes. They unblock the rest of M1.

### 13.1 Create the project
1. Create an Appwrite Cloud project (or self-hosted) at https://cloud.appwrite.io
2. Note the **Project ID** and the **API endpoint** (default `https://cloud.appwrite.io/v1`)
3. Add a **Web platform** with hostname `chrome-extension://<EXTENSION_ID>` so the SDK can authenticate from the extension
4. Update `src/shared/constants.ts`:
   - `APPWRITE_PROJECT_ID` → real project id
   - `APPWRITE_ENDPOINT` → endpoint URL
   - `APPWRITE_DATABASE_ID` → matches the database id created in 13.2

### 13.2 Database and collections
Create a database (default id `watchparty`) and the four collections below. All collections use document-level permissions; specifics are noted per collection.

**`channels`**
| Attribute | Type | Required | Default |
|-----------|------|----------|---------|
| `code` | string (size 8) | yes | — |
| `name` | string (size 60) | yes | — |
| `description` | string (size 280) | no | null |
| `visibility` | enum [public, private] | yes | public |
| `hostUserId` | string (size 64) | yes | — |
| `hostUsername` | string (size 32) | yes | — |
| `state` | enum [playing, paused, stopped] | yes | stopped |
| `currentVideoIndex` | integer | yes | 0 |
| `currentVideoStartedAt` | datetime | no | null |
| `pauseAccumMs` | integer | yes | 0 |
| `pausedAt` | datetime | no | null |
| `viewerCount` | integer | yes | 0 |
| `createdAt` | datetime | yes | — |

Indexes: `code` unique, `hostUserId` key, `visibility+createdAt` key.

Permissions: read = `any` (public discovery later); create = `users`; update/delete = host only via document permissions set at create time.

**`playlist_items`**
| Attribute | Type | Required |
|-----------|------|----------|
| `channelId` | string | yes |
| `position` | integer | yes |
| `videoId` | string (size 32) | yes |
| `videoTitle` | string (size 200) | yes |
| `videoDuration` | integer | no |
| `addedAt` | datetime | yes |

Indexes: `channelId+position` key.

Permissions: read = `any`; write = host of the parent channel (enforced via Function or per-doc perms set on insert).

**`chat_messages`**
| Attribute | Type | Required |
|-----------|------|----------|
| `channelId` | string | yes |
| `userId` | string | yes |
| `username` | string (size 32) | yes |
| `text` | string (size 300) | yes |
| `createdAt` | datetime | yes |

Indexes: `channelId+createdAt` key.

Permissions: read = `any`; create = `users`; delete via Function (cleanup on stop).

**`presence`**
| Attribute | Type | Required |
|-----------|------|----------|
| `channelId` | string | yes |
| `userId` | string | yes |
| `lastPing` | datetime | yes |

Indexes: `channelId+userId` unique, `lastPing` key.

Permissions: read = `any`; create/update/delete = self.

### 13.3 OAuth setup (Google → Appwrite → extension)
1. In Appwrite console → **Auth → Settings → OAuth2 Providers → Google**, enable and paste the Google OAuth client id/secret.
2. Add callback URL: `https://<your-appwrite-endpoint>/account/sessions/oauth2/callback/google/<projectId>` to the Google Cloud OAuth client.
3. Add the extension callback URL to Appwrite **Platforms → Web** allowed URIs:
   `https://<EXTENSION_ID>.chromiumapp.org/callback`
   (this is the URL `chrome.identity.getRedirectURL('callback')` returns).
4. After loading the unpacked extension, copy its ID from `chrome://extensions` and replace `<EXTENSION_ID>` in steps 1 and 3.

### 13.4 Server-side Functions (status)
- **channel-cleanup-on-stop** — DEFERRED. v1 ships with the chat wipe performed by the host's `handleStopBroadcast` calling `appwriteClient.wipeChat`. Move server-side later if abuse becomes a concern (any participant could currently call the SDK to delete a stopped channel's leftover chat).
- **presence-ttl-sweeper** — DEFERRED. v1 ships with a client-side sweep running every 60 s on each active participant via the `PRESENCE_SWEEP` alarm; stale presence rows are pruned by whichever participant fires the sweep first. Move server-side if presence collection growth becomes a concern.
- **advance-channel** — DEFERRED. v1 uses the best-effort client-side guarded write in `appwriteClient.advanceChannel`. Race window is small (sub-second) because the next viewer's read sees the updated index.

These three Functions are the natural follow-ups once load justifies the deployment cost.

## 15. v1 ship checklist

- [x] Foundation provisioned (M1 / T1–T3, T4 wired but unverified)
- [x] Channel + playlist UI (M2)
- [x] Host lifecycle controls (M3 / T10–T14; T15 replaced by client-side wipe)
- [x] Sync engine + ad handling (M4 / M5)
- [x] Ephemeral chat (M6 / T23–T25)
- [x] Presence count + sweep (M7 / T26)
- [x] Polish: status surfacing, Guest fallback, privacy/terms, package script (M8 / T27–T30)
- [ ] T31 manual QA (post-load): ad/no-ad, Premium vs free, late-join, host-disconnect, network flake
- [ ] Google OAuth provider configured in Appwrite + Google Cloud client (only if Google sign-in is required at launch)
- [ ] Chrome Web Store assets: screenshots, 128 px icon, store description, privacy policy URL (link `docs/PRIVACY.md` somewhere publicly hosted)

## 14. Risks and unknowns

- Appwrite OAuth callback flow inside a Chrome extension is unproven for this project — spike first
- YouTube DOM selectors (`#movie_player`, `ad-showing` class, `#top-level-buttons-computed`) are not stable APIs and can break on YT redesign — needs a monitoring/fallback strategy
- Appwrite Realtime fan-out latency under load not measured — may need backpressure for chat-heavy channels
- Optimistic-concurrency advance on `video.ended` can race when many viewers fire near-simultaneously — needs a conditional update or rate limit
- Anonymous abuse vectors (channel spam, chat flood) — needs rate limits before public launch
