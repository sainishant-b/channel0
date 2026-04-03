# Testing Guide: Preemptive Video Loading

## What Was Implemented

The extension now uses **preemptive video loading** to eliminate the delay between videos and prevent YouTube's autoplay from interfering.

### How It Works

1. **Preload Phase**: When a video starts playing, the content script immediately requests the next video ID from the service worker
2. **Store Phase**: The next video ID is stored in memory (`nextVideoId`)
3. **Instant Navigation**: When the video ends, the browser instantly navigates to the preloaded URL (zero latency)
4. **Server Notification**: After navigation, the extension notifies the server (async, non-blocking)

### Key Benefits

- **Zero-latency switching**: No waiting for server response
- **Beats YouTube autoplay**: Navigation happens before YouTube can trigger autoplay
- **Works offline**: Even if WebSocket is temporarily disconnected, navigation still works
- **Server fallback**: Server timer still runs for new clients joining mid-stream

## Testing Steps

### 1. Reload the Extension

Since the extension was just rebuilt, you need to reload it in Chrome:

1. Open `chrome://extensions/`
2. Find "Watch Party Extension"
3. Click the **refresh/reload icon** (circular arrow)
4. Verify no errors appear

### 2. Prepare Test Videos

Add 2-3 short videos (1-2 minutes each) to the queue via the admin panel:
- Open `http://localhost:3001/admin`
- Add videos with short durations for quick testing

### 3. Test the Flow

1. **Open YouTube** in a new tab
2. **Navigate to the first video** in your queue
3. **Watch for console logs**:
   - `[WatchParty Content] Preloaded next video: [videoId]` - should appear immediately when video starts
4. **Let the video play until the end**
5. **Observe the behavior**:
   - Video should pause immediately when it ends
   - Browser should instantly navigate to the next video (no delay)
   - No YouTube autoplay suggestions should appear

### 4. Verify Console Logs

Open Chrome DevTools (F12) and check for these logs:

**When video starts:**
```
[WatchParty Content] Video detected: [videoId]
[WatchParty Content] Video is scheduled: [title]
[WatchParty Content] Preloaded next video: [nextVideoId]
[WatchParty Content] Attached video ended listener
```

**When video ends:**
```
[WatchParty Content] Video ended, pausing to prevent autoplay
[WatchParty Content] Instantly navigating to preloaded next video: [nextVideoId]
```

### 5. Test Edge Cases

- **Last video in queue**: Should stay on the last video (no navigation)
- **Single video queue**: Should not navigate anywhere
- **Manual skip**: Admin panel skip should still work
- **Multiple tabs**: Only the tab with the overlay should navigate

## Troubleshooting

### Issue: Extension not loading
- **Solution**: Reload extension in `chrome://extensions/`

### Issue: No console logs
- **Solution**: Make sure DevTools is open and Console tab is selected

### Issue: Video doesn't navigate
- **Check**: Is the overlay visible? (Only tabs with overlay navigate)
- **Check**: Are there more videos in the queue?
- **Check**: Console logs for errors

### Issue: YouTube autoplay still triggers
- **Check**: Is the video actually ending or are you skipping?
- **Check**: Console logs - is `nextVideoId` being preloaded?

## What to Look For

✅ **Success indicators:**
- Instant navigation when video ends (no delay)
- No YouTube autoplay suggestions
- Console shows "Preloaded next video" message
- Smooth transition between videos

❌ **Failure indicators:**
- Delay before navigation
- YouTube autoplay suggestions appear
- Console errors
- Video restarts instead of advancing

## Current Status

- ✅ Code implemented and built
- ✅ Server running on `localhost:3001`
- ✅ Extension built to `watch-party-extension/dist`
- ⏳ **Next step**: Reload extension and test with short videos

## Files Modified

- `watch-party-extension/src/content/content-script.ts` - Added preloading logic
- `watch-party-extension/src/background/service-worker.ts` - Added GET_NEXT_VIDEO handler
- `watch-party-extension/src/background/websocket-client.ts` - Added sendVideoEnded method
- `watch-party-extension/src/shared/message-types.ts` - Added message types
- `server/src/websocket-server.ts` - Added videoEnded handler
- `server/src/services/schedule-service.ts` - Fixed queue advancement logic
