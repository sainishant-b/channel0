# Watch Party — Resume Context

> Read this first when picking the project back up. It points at the
> living plan and lists exactly what to do next.

## TL;DR

Watch Party is a Chrome extension that turns YouTube into TV-style
channels. A host curates a playlist and broadcasts via a 6-char code;
viewers join, the content script syncs playback on the real
`youtube.com/watch` tab, and chat runs in the dashboard + as an
overlay on the YouTube page. Backend is Appwrite Cloud.

v1 is code-complete and pushed to `origin/claude/zealous-brattain-528e80`.
A pull request has not been opened yet.

## Source of truth

The full product plan, locked decisions, milestones, ticket statuses,
and risks live in [`docs/PLAN.md`](./PLAN.md). Always read PLAN.md
before changing scope.

Other docs:
- [`docs/PRIVACY.md`](./PRIVACY.md) — user-facing privacy policy
- [`docs/TERMS.md`](./TERMS.md) — user-facing terms of use

## Where things live

```
watch-party-extension/
├ src/
│  ├ background/
│  │  ├ service-worker.ts         # message router, alarms, lifecycle
│  │  ├ auth-service.ts           # anon + Google OAuth
│  │  └ websocket-client.ts       # Appwrite Realtime subscriber
│  ├ content/content-script.ts    # overlay + drift loop + ad observer
│  ├ popup/
│  │  ├ Popup.tsx                 # router for views
│  │  ├ Dashboard.tsx             # full-page session view (live ticker + chat + playlist)
│  │  ├ PlaylistEditor.tsx
│  │  └ MyChannels.tsx
│  ├ options/Options.tsx
│  └ shared/
│     ├ api-client.ts             # Appwrite SDK wrapper
│     ├ message-types.ts          # SW <-> popup / content message union
│     ├ types.ts                  # ChannelDoc, PlaylistItem, ChatMessage
│     ├ constants.ts              # endpoint, project id, DB id, alarms
│     └ youtube-helpers.ts        # extractVideoId, fetchVideoTitle (oEmbed)
├ scripts/
│  ├ appwrite/provision.sh        # re-runnable collection provisioner
│  ├ package.mjs                  # build + zip dist/ for Chrome Web Store
│  └ build.mjs                    # copies manifest + icons after Vite
├ vite.config.ts                  # popup, options, service worker (ES modules)
├ vite.content.config.ts          # content script (IIFE — MV3 content scripts can't be modules)
├ manifest.json
└ .mcp.json                       # gitignored — Appwrite MCP server config with API key
```

## Backend wiring

- **Endpoint:** `https://nyc.cloud.appwrite.io/v1`
- **Project ID:** `69ae7d60001c0117191e`
- **Database ID:** `69f977a80001f12a0a6f`
- **Collections (all live, provisioned):** `channels`, `playlist_items`, `chat_messages`, `presence`
- **Registered platform:** `chrome-extension://iliggmmddgmioogjmomicbdgnnhlkked` (web type, raw extension id as hostname)
- **API key:** in `.appwrite-key` (gitignored). Same value duplicated in `.mcp.json` for the Appwrite MCP server.

## Build + run

```bash
cd watch-party-extension
npm install              # one-time
npm run build            # → dist/ ready to load unpacked
npm run package          # → dist-package/watch-party-vX.Y.Z.zip
```

Load unpacked from `dist/` in `chrome://extensions`. Confirm the
extension id still matches `iliggmmddgmioogjmomicbdgnnhlkked`; if it
drifts (re-install / different machine), register the new id as a Web
platform in the Appwrite console or via REST.

## Known working

- Anonymous Appwrite session on install
- Host create channel → row appears in `channels` table with a unique 6-char code
- Playlist add / remove / reorder via REST through SW
- Start / pause / resume / skip / stop broadcast updates channel state correctly
- Chat send and chat realtime fan-out via Appwrite Realtime
- Chat wiped on `STOP_BROADCAST` (`appwriteClient.wipeChat`)
- Presence row created + swept every 60 s
- Dashboard live ticker (250 ms tick, progress bar, pulsing dot)
- Click thumbnail → opens `youtube.com/watch?v=...&t=channelTime` in a new tab; content script overlay attaches

## Known constraints / not yet done

- **Embed in dashboard not possible** from `chrome-extension://` origin.
  YouTube returns Error 153. The "video plays in dashboard" UX
  requires hosting the dashboard on an HTTP(S) origin — see PLAN.md
  §11 option B.
- **Google OAuth provider not configured in Appwrite console.** Anon
  flow works fine; Google sign-in needs:
  1. Create Google Cloud OAuth client
  2. Paste client id + secret into Appwrite Auth → OAuth2 → Google
  3. Add `chrome-extension://<ID>.chromiumapp.org/callback` to allowed redirect URIs
- **Manual test matrix not run** (T31 in PLAN.md): ad/no-ad, Premium/free, late-join, host-disconnect, network flake.
- **No PR open yet.** Commit `ec27454` pushed but the PR URL hasn't been visited.
- **No Chrome Web Store submission.** Privacy policy is in the repo but
  not hosted publicly — needs a URL for the store listing.

## Branch state

- Branch: `claude/zealous-brattain-528e80`
- Latest commit: `ec27454` — "Rebuild watch party as TV-channel app on Appwrite" (34 files, +4382 / −2938)
- Remote: `https://github.com/sainishant-b/channel0`
- PR template URL: `https://github.com/sainishant-b/channel0/pull/new/claude/zealous-brattain-528e80`

## Steps to do next (in order)

### 1. Open the PR
```bash
gh pr create --base main --head claude/zealous-brattain-528e80 \
  --title "Rebuild watch party as TV-channel app on Appwrite" \
  --body-file docs/PLAN.md
```
Or paste the PR URL above into the browser and fill the body manually.

### 2. Smoke test the unpacked extension end to end
1. `chrome://extensions` → reload Watch Party
2. Open the dashboard tab via the toolbar icon
3. Host a Party → fill name + Public + paste any YouTube URL
4. Verify a row appears in Appwrite `channels` table
5. Press **▶ Start** → ticker advances + progress bar fills
6. Click the thumbnail → real youtube.com/watch tab opens at the right timestamp; overlay attaches
7. Send chat from both the dashboard and the overlay → messages cross-render
8. Press **⏹ Stop** → chat rows for that channelId disappear from Appwrite

### 3. Decide on the embed question
- Ship as-is (option A — done). The host has a live ticker; watching happens on youtube.com.
- Or invest ~6 hours in option B: extract `Dashboard.tsx` into a standalone Vite app, deploy to Vercel, point the extension at the hosted URL. Embed will work because origin is HTTPS. See PLAN.md §11 / option B for the cost breakdown.

### 4. (Optional) Configure Google OAuth
Follow PLAN.md §13.3 if you want signed-in users at v1. Otherwise leave anonymous-only.

### 5. (Optional) Ship to Chrome Web Store
1. Host `docs/PRIVACY.md` somewhere public (GitHub Pages, Notion, etc.) — note the URL
2. `npm run package` to produce the zip
3. Upload to https://chrome.google.com/webstore/devconsole
4. Fill in the store listing — single-purpose description, permission justifications, privacy URL (PLAN.md §11 covers the field-by-field guidance)

## Quickref commands

```bash
# Rebuild after any code edit
cd watch-party-extension && npm run build

# Rebuild + zip for the Chrome Web Store
npm run package

# Just typecheck
./node_modules/.bin/tsc --noEmit

# Re-provision Appwrite (only against an empty database)
bash scripts/appwrite/provision.sh

# Query the channels collection directly to sanity-check writes
source .appwrite-key
curl -fsS \
  -H "X-Appwrite-Project: $APPWRITE_PROJECT_ID" \
  -H "X-Appwrite-Key: $APPWRITE_API_KEY" \
  "$APPWRITE_ENDPOINT/databases/$APPWRITE_DATABASE_ID/collections/channels/documents"
```

## When something breaks

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `XMLHttpRequest is not defined` in SW console | Old Appwrite SDK (< v25) reverted | Verify `appwrite` in `package.json` is `^25.x` and rebuild |
| `window is not defined` / `getItem` errors in SW | Polyfills missing | Top of `service-worker.ts` must alias `window = globalThis` and stub `localStorage` / `sessionStorage` |
| `Permissions must be one of...` on createChannel | Used `getUserId()` (local) where Appwrite account `$id` was expected | Use `authService.getAppwriteUserId()` for `Role.user(...)` |
| `Invalid document structure: Unknown attribute: "X"` | Appwrite attr stuck in `processing` | Drop + recreate it via REST (see commit history for the pattern) |
| Dashboard shows session view immediately with an old code | Stale `chrome.storage.local` session | In dashboard DevTools console: `chrome.storage.local.remove('watchparty_active_session')` and reload |
| Embed shows "Error 153" | YouTube rejects chrome-extension origin — by design | Open via thumbnail click (current UX), or move to option B |

## Memory pointer

The auto-memory entry [`project_watch_party_plan.md`](../../../../.claude/projects/C--Users-saini-PROJECT-channel0/memory/project_watch_party_plan.md)
already points new Claude sessions at `docs/PLAN.md`. Add a pointer to
this file too if you want sessions to land on the resume context first.
