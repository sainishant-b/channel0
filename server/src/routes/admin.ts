import { Router } from 'express';
import { scheduleService } from '../services/schedule-service.js';

const router = Router();

// Get current queue
router.get('/queue', (_req, res) => {
  const queue = scheduleService.getQueue();
  const current = scheduleService.getCurrentShow();
  const totalDuration = queue.reduce((sum, item) => sum + item.duration, 0);
  res.json({ 
    queue, 
    totalDuration,
    currentVideoId: current?.videoId || null 
  });
});

// Get current show with timestamp
router.get('/current', (_req, res) => {
  const current = scheduleService.getCurrentShow();
  if (!current) {
    return res.json({ current: null, timestamp: 0 });
  }
  
  const timestamp = scheduleService.calculateCurrentTimestamp(current);
  const timeRemaining = current.duration - timestamp;
  const currentEndTime = Date.now() + (timeRemaining * 1000);
  
  // Calculate total remaining time for all videos
  const queue = scheduleService.getQueue();
  let totalRemaining = timeRemaining;
  for (let i = 1; i < queue.length; i++) {
    totalRemaining += queue[i].duration;
  }
  const allEndTime = Date.now() + (totalRemaining * 1000);
  
  res.json({ 
    current, 
    timestamp,
    timeRemaining,
    currentEndTime,
    allEndTime,
  });
});

// Add video to queue
router.post('/queue', async (req, res) => {
  const { videoUrl, title } = req.body;
  
  if (!videoUrl) {
    return res.status(400).json({ error: 'videoUrl is required' });
  }
  
  // Extract video ID from URL
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }
  
  // Fetch video metadata from YouTube
  let videoTitle = title;
  let videoDuration: number;
  
  try {
    const metadata = await fetchYouTubeMetadata(videoId);
    if (!videoTitle) {
      videoTitle = metadata.title;
    }
    videoDuration = metadata.duration;
    
    // Validate that we got a real duration (not the default)
    if (videoDuration === 600) {
      console.warn('[Admin] Could not fetch actual duration for video, rejecting');
      return res.status(400).json({ 
        error: 'Could not fetch video duration from YouTube. The video may be private, unavailable, or age-restricted.' 
      });
    }
  } catch (err) {
    console.error('[Admin] Failed to fetch YouTube metadata:', err);
    return res.status(400).json({ 
      error: 'Failed to fetch video information from YouTube. Please check the URL and try again.' 
    });
  }
  
  const show = scheduleService.addToQueue(videoId, videoTitle, videoDuration);
  res.json({ success: true, show });
});

// Add playlist to queue
router.post('/playlist', async (req, res) => {
  const { playlistUrl } = req.body;
  
  if (!playlistUrl) {
    return res.status(400).json({ error: 'playlistUrl is required' });
  }
  
  // Extract playlist ID
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    return res.status(400).json({ error: 'Invalid YouTube playlist URL' });
  }
  
  try {
    const videos = await fetchPlaylistVideos(playlistId);
    
    if (videos.length === 0) {
      return res.status(400).json({ error: 'No videos found in playlist or playlist is private' });
    }
    
    const addedShows = [];
    for (const video of videos) {
      const show = scheduleService.addToQueue(video.videoId, video.title, video.duration);
      addedShows.push(show);
    }
    
    res.json({ success: true, count: addedShows.length, shows: addedShows });
  } catch (err) {
    console.error('[Admin] Failed to fetch playlist:', err);
    res.status(500).json({ error: 'Failed to fetch playlist videos' });
  }
});

// Remove video from queue
router.delete('/queue/:showId', (req, res) => {
  const { showId } = req.params;
  const success = scheduleService.removeFromQueue(showId);
  
  if (!success) {
    return res.status(404).json({ error: 'Show not found or currently playing' });
  }
  
  res.json({ success: true });
});

// Reorder queue
router.put('/queue/reorder', (req, res) => {
  const { showIds } = req.body;
  
  if (!Array.isArray(showIds)) {
    return res.status(400).json({ error: 'showIds must be an array' });
  }
  
  scheduleService.reorderQueue(showIds);
  res.json({ success: true });
});

// Skip current video
router.post('/skip', (_req, res) => {
  scheduleService.skipCurrent();
  res.json({ success: true });
});

// Clear queue
router.delete('/queue', (_req, res) => {
  scheduleService.clearQueue();
  res.json({ success: true });
});

// Helper to extract video ID from various YouTube URL formats
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // Just the video ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

// Helper to extract playlist ID from YouTube URL
function extractPlaylistId(url: string): string | null {
  const patterns = [
    /[?&]list=([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]+)$/, // Just the playlist ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

// Fetch video metadata using YouTube's page (no API key needed)
async function fetchYouTubeMetadata(videoId: string): Promise<{ title: string; duration: number }> {
  try {
    // Try oEmbed first for title
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedRes = await fetch(oembedUrl);
    
    let title = `Video ${videoId}`;
    if (oembedRes.ok) {
      const oembedData = await oembedRes.json() as { title?: string };
      title = oembedData.title || title;
    }
    
    // Fetch the video page to get duration
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageRes = await fetch(pageUrl);
    const html = await pageRes.text();
    
    // Extract duration from page HTML - try multiple patterns
    let duration: number | null = null;
    
    // Pattern 1: "lengthSeconds":"123"
    let durationMatch = html.match(/"lengthSeconds":"(\d+)"/);
    if (durationMatch) {
      duration = parseInt(durationMatch[1], 10);
      console.log(`[Admin] Found duration (pattern 1): ${duration}s`);
    } else {
      // Pattern 2: lengthSeconds":123 (without quotes around number)
      durationMatch = html.match(/"lengthSeconds":(\d+)/);
      if (durationMatch) {
        duration = parseInt(durationMatch[1], 10);
        console.log(`[Admin] Found duration (pattern 2): ${duration}s`);
      } else {
        // Pattern 3: approxDurationMs
        durationMatch = html.match(/"approxDurationMs":"(\d+)"/);
        if (durationMatch) {
          duration = Math.floor(parseInt(durationMatch[1], 10) / 1000);
          console.log(`[Admin] Found duration (pattern 3): ${duration}s`);
        }
      }
    }
    
    if (!duration) {
      console.error(`[Admin] Could not extract duration for ${videoId}`);
      throw new Error('Could not extract video duration from YouTube page');
    }
    
    console.log(`[Admin] Fetched metadata for ${videoId}: "${title}" (${duration}s / ${Math.floor(duration/60)}m)`);
    
    return { title, duration };
  } catch (err) {
    console.error('[Admin] Error fetching metadata:', err);
    throw err;
  }
}

// Fetch playlist videos (scraping approach - no API key needed)
async function fetchPlaylistVideos(playlistId: string): Promise<Array<{ videoId: string; title: string; duration: number }>> {
  try {
    const url = `https://www.youtube.com/playlist?list=${playlistId}`;
    const res = await fetch(url);
    const html = await res.text();
    
    const videos: Array<{ videoId: string; title: string; duration: number }> = [];
    
    // Extract video data from the page
    // Look for videoId and title patterns in the HTML/JSON
    const videoIdMatches = html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g);
    const titleMatches = html.matchAll(/"title":\{"runs":\[\{"text":"([^"]+)"\}\]/g);
    const durationMatches = html.matchAll(/"lengthSeconds":"(\d+)"/g);
    
    const videoIds = [...videoIdMatches].map(m => m[1]);
    const titles = [...titleMatches].map(m => m[1]);
    const durations = [...durationMatches].map(m => parseInt(m[1], 10));
    
    // Remove duplicates and pair up data
    const seenIds = new Set<string>();
    for (let i = 0; i < videoIds.length && videos.length < 50; i++) {
      const videoId = videoIds[i];
      if (!seenIds.has(videoId)) {
        seenIds.add(videoId);
        videos.push({
          videoId,
          title: titles[videos.length] || `Video ${videoId}`,
          duration: durations[videos.length] || 300, // Default 5 min
        });
      }
    }
    
    console.log(`[Admin] Fetched ${videos.length} videos from playlist ${playlistId}`);
    
    return videos;
  } catch (err) {
    console.error('[Admin] Error fetching playlist:', err);
    throw err;
  }
}

export default router;
